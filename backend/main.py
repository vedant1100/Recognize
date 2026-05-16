"""
Context Graph — GraphRAG backend
Neo4j graph database + entity extraction + community detection + Claude
"""

import asyncio
import io
import json
import os
import re
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import anthropic
import markdown as md
import networkx as nx
import numpy as np
import pypdf
import docx
import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from neo4j import GraphDatabase
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Context Graph — GraphRAG")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ────────────────────────────────────────────────────────────────────
NEO4J_URI  = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER",     "neo4j")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "Durban@28")
EMBED_DIM  = 384  # all-MiniLM-L6-v2

driver       = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))
embedder     = SentenceTransformer("all-MiniLM-L6-v2")
claude       = anthropic.Anthropic()
async_claude = anthropic.AsyncAnthropic()


# ── Neo4j schema bootstrap ────────────────────────────────────────────────────
def _setup_schema(tx):
    # Uniqueness constraints
    for label, prop in [("Document", "id"), ("Chunk", "id"), ("Entity", "id"), ("Community", "id")]:
        tx.run(f"CREATE CONSTRAINT {label.lower()}_{prop}_unique IF NOT EXISTS "
               f"FOR (n:{label}) REQUIRE n.{prop} IS UNIQUE")

    # Vector indexes (requires Neo4j 5.11+)
    for idx, label, prop in [
        ("entity_vec",  "Entity",  "embedding"),
        ("chunk_vec",   "Chunk",   "embedding"),
    ]:
        try:
            tx.run(f"""
                CREATE VECTOR INDEX {idx} IF NOT EXISTS
                FOR (n:{label}) ON (n.{prop})
                OPTIONS {{indexConfig: {{
                    `vector.dimensions`: {EMBED_DIM},
                    `vector.similarity_function`: 'cosine'
                }}}}
            """)
        except Exception:
            pass  # Index may already exist or version < 5.11


try:
    with driver.session() as s:
        s.execute_write(_setup_schema)
    print("[OK] Neo4j schema ready")
except Exception as e:
    print(f"[WARN] Neo4j not reachable at startup: {e}")


# ── Text extraction & chunking ─────────────────────────────────────────────────
def extract_text(content: bytes, filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(p.extract_text() or "" for p in reader.pages)
    if ext in (".docx", ".doc"):
        doc = docx.Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs)
    return content.decode("utf-8", errors="ignore")


def chunk_text(text: str, size: int = 600, overlap: int = 80) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    chunks, i = [], 0
    while i < len(text):
        chunks.append(text[i : i + size])
        i += size - overlap
    return [c for c in chunks if len(c) > 50]


# ── GraphRAG entity extraction ─────────────────────────────────────────────────
EXTRACT_SYSTEM = "You are a knowledge graph extraction engine. Output only valid JSON, no markdown."

EXTRACT_USER = """Extract entities and relationships from the text below.

Return ONLY this JSON (no code fences, no extra text):
{
  "entities": [
    {"name": "...", "type": "CONCEPT|PERSON|ORGANIZATION|PLACE|TECHNOLOGY|EVENT", "description": "one sentence"}
  ],
  "relationships": [
    {"source": "EntityA", "target": "EntityB", "relation": "VERB_PHRASE"}
  ]
}

Text:
__TEXT__"""


async def extract_graph(text: str) -> dict:
    try:
        resp = await async_claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1200,
            system=EXTRACT_SYSTEM,
            messages=[{"role": "user", "content": EXTRACT_USER.replace("__TEXT__", text)}],
        )
        raw = resp.content[0].text.strip()
        raw = re.sub(r"^```[a-z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        # Slice out the first {...} object in case Claude added preamble/trailing prose
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start : end + 1]
        return json.loads(raw)
    except Exception as e:
        print(f"[extract_graph] FAILED: {type(e).__name__}: {e}")
        print(f"[extract_graph] raw response:\n{raw[:1000] if 'raw' in dir() else '(no response)'}\n---")
        return {"entities": [], "relationships": []}


# ── Neo4j write helpers ───────────────────────────────────────────────────────
ENTITY_MERGE_THRESHOLD = 0.90  # cosine similarity above which we treat two entities as the same

def _find_similar_entity(session, embedding: list[float]) -> Optional[str]:
    """Return an existing entity id if one is very similar to this embedding."""
    try:
        hits = session.run(
            """
            CALL db.index.vector.queryNodes('entity_vec', 1, $emb)
            YIELD node AS e, score
            WHERE score >= $thresh
            RETURN e.id AS id
            """,
            emb=embedding, thresh=ENTITY_MERGE_THRESHOLD,
        ).data()
        if hits:
            return hits[0]["id"]
    except Exception:
        pass
    return None


def _upsert_entity(tx, name: str, etype: str, desc: str, embedding: list[float]):
    entity_id = f"entity:{name.lower().replace(' ', '_')}"
    tx.run(
        """
        MERGE (e:Entity {id: $id})
        ON CREATE SET e.name = $name, e.type = $type, e.description = $desc,
                      e.embedding = $emb, e.mention_count = 1
        ON MATCH  SET e.mention_count = e.mention_count + 1,
                      e.description   = CASE WHEN size($desc) > size(e.description)
                                             THEN $desc ELSE e.description END
        """,
        id=entity_id, name=name, type=etype, desc=desc, emb=embedding,
    )
    return entity_id


def _bump_mention(tx, entity_id: str):
    tx.run("MATCH (e:Entity {id: $id}) SET e.mention_count = e.mention_count + 1", id=entity_id)


def _upsert_relation(tx, src_id: str, tgt_id: str, relation: str):
    tx.run(
        """
        MATCH (a:Entity {id: $src}), (b:Entity {id: $tgt})
        MERGE (a)-[r:RELATES_TO {relation: $rel}]->(b)
        ON CREATE SET r.weight = 1
        ON MATCH  SET r.weight = r.weight + 1
        """,
        src=src_id, tgt=tgt_id, rel=relation,
    )


def _link_chunk_entity(tx, chunk_id: str, entity_id: str):
    tx.run(
        """
        MATCH (c:Chunk {id: $cid}), (e:Entity {id: $eid})
        MERGE (c)-[:MENTIONS]->(e)
        """,
        cid=chunk_id, eid=entity_id,
    )


# ── Upload & ingest ───────────────────────────────────────────────────────────
async def ingest_file(content: bytes, filename: str) -> dict:
    doc_id = str(uuid.uuid4())
    text   = extract_text(content, filename)
    if not text.strip():
        raise ValueError("Could not extract text.")

    chunks = chunk_text(text)

    # Phase 1: all Claude calls in parallel
    graph_datas = await asyncio.gather(*[extract_graph(c) for c in chunks])

    # Phase 2: batch-encode everything in one shot (chunks + all entity texts)
    entity_rows: list[tuple[int, str, str, str]] = []  # (chunk_idx, name, etype, desc)
    for ci, gd in enumerate(graph_datas):
        for ent in gd.get("entities", []):
            name = ent.get("name", "").strip()
            if name:
                entity_rows.append((ci, name, ent.get("type", "CONCEPT"), ent.get("description", name)))

    all_texts  = list(chunks) + [f"{name}: {desc}" for (_, name, _, desc) in entity_rows]
    all_embs   = embedder.encode(all_texts)
    chunk_embs = all_embs[:len(chunks)]
    ent_embs   = all_embs[len(chunks):]

    # Group pre-computed embeddings back by chunk index
    ents_by_chunk: dict[int, list] = defaultdict(list)
    for j, (ci, name, etype, desc) in enumerate(entity_rows):
        ents_by_chunk[ci].append((name, etype, desc, ent_embs[j].tolist()))

    # Phase 3: sequential Neo4j writes
    with driver.session() as session:
        session.run(
            "CREATE (d:Document {id: $id, filename: $fn, chunk_count: $cc})",
            id=doc_id, fn=filename, cc=len(chunks),
        )
        for i, (chunk, chunk_emb, graph_data) in enumerate(zip(chunks, chunk_embs, graph_datas)):
            chunk_id = str(uuid.uuid4())
            session.run(
                "CREATE (c:Chunk {id: $id, text: $text, doc_id: $doc, chunk_index: $i, embedding: $emb})",
                id=chunk_id, text=chunk, doc=doc_id, i=i, emb=chunk_emb.tolist(),
            )
            session.run(
                "MATCH (d:Document {id: $doc}), (c:Chunk {id: $cid}) MERGE (d)-[:HAS_CHUNK]->(c)",
                doc=doc_id, cid=chunk_id,
            )

            name_to_id: dict[str, str] = {}
            for (name, etype, desc, emb) in ents_by_chunk[i]:
                existing_id = _find_similar_entity(session, emb)
                if existing_id:
                    eid = existing_id
                    session.execute_write(_bump_mention, eid)
                else:
                    eid = session.execute_write(_upsert_entity, name, etype, desc, emb)
                name_to_id[name.lower()] = eid
                session.execute_write(_link_chunk_entity, chunk_id, eid)

            for rel in graph_data.get("relationships", []):
                src = rel.get("source", "").strip().lower()
                tgt = rel.get("target", "").strip().lower()
                relation = rel.get("relation", "RELATED_TO")
                if src in name_to_id and tgt in name_to_id:
                    session.execute_write(_upsert_relation, name_to_id[src], name_to_id[tgt], relation)

    return {"doc_id": doc_id, "chunks": len(chunks), "filename": filename}


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    try:
        result = await ingest_file(content, file.filename)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"added": result["chunks"], "filename": result["filename"], "doc_id": result["doc_id"]}


# ── Graph data for visualization ──────────────────────────────────────────────
@app.get("/api/graph")
async def get_graph():
    with driver.session() as s:
        entities = s.run(
            """
            MATCH (e:Entity)
            OPTIONAL MATCH (e)-[r:RELATES_TO]-()
            WITH e, count(r) AS degree
            RETURN e.id AS id, e.name AS label, e.type AS type,
                   e.description AS preview, degree
            ORDER BY degree DESC
            LIMIT 500
            """
        ).data()

        links = s.run(
            """
            MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
            RETURN a.id AS source, b.id AS target,
                   r.relation AS relation,
                   toFloat(r.weight) / 10.0 AS strength
            LIMIT 1200
            """
        ).data()

    nodes = [
        {
            "id":          e["id"],
            "label":       e["label"],
            "type":        e["type"] or "CONCEPT",
            "preview":     (e["preview"] or e["label"])[:150] + "…",
            "chunk_index": 0,
            "connections": e["degree"],
        }
        for e in entities
    ]
    edges = [
        {
            "source":   l["source"],
            "target":   l["target"],
            "relation": l["relation"],
            "strength": min(1.0, max(0.1, l["strength"] or 0.3)),
        }
        for l in links
    ]
    return {"nodes": nodes, "links": edges}


# ── Meeting session finalization ──────────────────────────────────────────────
class SessionWord(BaseModel):
    speaker: str
    word: str
    ts: int

class SessionRequest(BaseModel):
    recorded_at: str
    duration_seconds: int = 0
    participants: list[str] = []
    words: list[SessionWord]

MOM_SYSTEM = "You are a professional meeting secretary. Output only clean Markdown, no preamble or code fences."

MOM_PROMPT = """Create structured Minutes of Meeting from this transcript.

Date: {date}
Duration: {duration}
Participants: {participants}

Transcript:
{transcript}

Use this exact structure:
# Minutes of Meeting — {date}
**Participants:** {participants}
**Duration:** {duration}

## Summary
2-3 sentence overview.

## Key Discussion Points
- ...

## Decisions Made
- ... (write "None recorded" if absent)

## Action Items
| Owner | Action |
|-------|--------|
| name | task |

## Full Transcript
**SpeakerName:** their words..."""


@app.post("/api/session/finalize")
async def finalize_session(req: SessionRequest, background_tasks: BackgroundTasks):
    if not req.words:
        raise HTTPException(400, "No transcript words provided.")

    # Group consecutive words by same speaker into utterances
    utterances: list[dict] = []
    cur: dict | None = None
    for w in req.words:
        if not cur or cur["speaker"] != w.speaker:
            cur = {"speaker": w.speaker, "text": w.word}
            utterances.append(cur)
        else:
            cur["text"] += " " + w.word

    transcript = "\n".join(f"**{u['speaker']}:** {u['text']}" for u in utterances)

    date_str = req.recorded_at[:10]
    mins, secs = divmod(req.duration_seconds, 60)
    duration_str = f"{mins}m {secs}s"
    participants_str = ", ".join(req.participants) if req.participants else "Unknown"

    mom_resp = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        system=MOM_SYSTEM,
        messages=[{"role": "user", "content": MOM_PROMPT.format(
            date=date_str,
            duration=duration_str,
            participants=participants_str,
            transcript=transcript,
        )}],
    )
    mom_markdown = mom_resp.content[0].text.strip()

    # Build raw transcript markdown — preserves speaker detail MoM may omit
    transcript_markdown = (
        f"# Meeting Transcript — {date_str}\n"
        f"**Participants:** {participants_str}\n"
        f"**Duration:** {duration_str}\n\n"
        + transcript
    )

    # Ingest both in parallel — Neo4j deduplicates overlapping entities automatically
    mom_result, transcript_result = await asyncio.gather(
        ingest_file(mom_markdown.encode("utf-8"),        f"meeting-{date_str}-mom.md"),
        ingest_file(transcript_markdown.encode("utf-8"), f"meeting-{date_str}-transcript.md"),
    )

    # Debrief agent runs in background after ingestion completes
    background_tasks.add_task(_run_debrief_agent, mom_markdown, req.participants, date_str)

    return {
        "mom":        {"doc_id": mom_result["doc_id"],        "chunks": mom_result["chunks"]},
        "transcript": {"doc_id": transcript_result["doc_id"], "chunks": transcript_result["chunks"]},
        "chunks":     mom_result["chunks"] + transcript_result["chunks"],
    }


# ── Debrief email rendering (debrief logic lives in agents/debrief-agent) ─────
def _build_email_html(debrief: dict, date_str: str, mom_text: str = "") -> str:
    contradictions = debrief.get("contradictions", [])
    action_items   = debrief.get("action_items", [])
    summary        = debrief.get("summary", "")

    mom_html = md.markdown(mom_text, extensions=["tables", "fenced_code"]) if mom_text else ""

    if contradictions:
        rows = "".join(
            f"<tr><td><strong>{c['topic']}</strong></td>"
            f"<td>{c['current_decision']}</td>"
            f"<td>{c['past_decision']}</td>"
            f"<td style='color:#6b7280;font-size:12px'>{c.get('source_meeting','')}</td></tr>"
            for c in contradictions
        )
        contra_block = f"""
        <h3 style="color:#ef4444">⚠️ Contradictions Found</h3>
        <table border="1" cellpadding="8" cellspacing="0"
               style="border-collapse:collapse;width:100%;font-size:14px">
          <tr style="background:#fef2f2">
            <th>Topic</th><th>Today's Decision</th>
            <th>Past Decision</th><th>Source Meeting</th>
          </tr>{rows}
        </table>"""
    else:
        contra_block = "<h3 style='color:#22c55e'>✓ No contradictions found with past meetings</h3>"

    if action_items:
        rows = "".join(
            f"<tr><td><strong>{a['owner']}</strong></td>"
            f"<td>{a['action']}</td>"
            f"<td style='color:#f59e0b'>{a.get('open_history') or '—'}</td></tr>"
            for a in action_items
        )
        action_block = f"""
        <h3>📋 Action Items</h3>
        <table border="1" cellpadding="8" cellspacing="0"
               style="border-collapse:collapse;width:100%;font-size:14px">
          <tr style="background:#f0f9ff">
            <th>Owner</th><th>Action</th><th>Open Items from Past Meetings</th>
          </tr>{rows}
        </table>"""
    else:
        action_block = "<h3>📋 Action Items</h3><p>None recorded.</p>"

    mom_block = f"""
      <h3>📝 Meeting Notes</h3>
      <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:6px;
                  padding:16px 20px;font-size:14px;line-height:1.55;color:#1f2937">
        {mom_html}
      </div>
      <br>
    """ if mom_html else ""

    return f"""
    <div style="font-family:sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#111">
      <h2 style="border-bottom:2px solid #e5e7eb;padding-bottom:8px">
        Meeting Debrief — {date_str}
      </h2>
      <h3>Summary</h3>
      <p style="color:#374151">{summary}</p>
      {mom_block}
      {contra_block}
      <br>
      {action_block}
      <hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px">
        Generated by Recognize · GraphRAG Debrief Agent
      </p>
    </div>"""


AGENTFIELD_URL = os.getenv("AGENTFIELD_URL", "http://localhost:8080")
DEBRIEF_AGENT_ENDPOINT = f"{AGENTFIELD_URL}/api/v1/execute/debrief-agent.debrief_run_debrief"


async def _run_debrief_agent(mom_text: str, participants: list[str], date_str: str):
    recipients = os.getenv("MEETING_RECIPIENTS", "")
    if not recipients:
        print("[Debrief] MEETING_RECIPIENTS not set — skipping email")
        return

    try:
        async with httpx.AsyncClient() as client:
            agent_resp = await client.post(
                DEBRIEF_AGENT_ENDPOINT,
                json={"input": {
                    "mom_text":     mom_text,
                    "participants": participants,
                    "date_str":     date_str,
                }},
                timeout=120,
            )
            agent_resp.raise_for_status()
            payload = agent_resp.json()
    except Exception as e:
        print(f"[Debrief] Agent call failed: {e}")
        return

    # AgentField wraps reasoner return value under `output` (or similar).
    # Accept either {output: {...}} or the raw debrief dict.
    debrief_result = payload.get("output") or payload.get("result") or payload
    if not isinstance(debrief_result, dict) or "summary" not in debrief_result:
        print(f"[Debrief] Unexpected agent response shape: {payload}")
        return

    html = _build_email_html(debrief_result, date_str, mom_text=mom_text)
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                "http://localhost:3001/send",
                json={"to": recipients, "subject": f"Meeting Debrief — {date_str}", "html": html},
                timeout=10,
            )
        print(f"[Debrief] Email sent for {date_str}")
    except Exception as e:
        print(f"[Debrief] Email send failed: {e}")


# ── Local GraphRAG query ──────────────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str
    k: int = 8
    mode: str = "local"  # "local" or "global"


@app.post("/api/query")
async def query(req: QueryRequest):
    if req.mode == "global":
        return await _global_query(req)
    return await _local_query(req)


async def _local_query(req: QueryRequest):
    q_emb = embedder.encode(req.query).tolist()

    with driver.session() as s:
        # 1. Vector-search entities
        try:
            entity_hits = s.run(
                """
                CALL db.index.vector.queryNodes('entity_vec', $k, $emb)
                YIELD node AS e, score
                RETURN e.id AS id, e.name AS name, e.type AS type,
                       e.description AS desc, score
                """,
                k=req.k, emb=q_emb,
            ).data()
        except Exception:
            # Fallback if vector index not available
            entity_hits = s.run(
                "MATCH (e:Entity) RETURN e.id AS id, e.name AS name, e.type AS type, "
                "e.description AS desc, 0.5 AS score LIMIT $k",
                k=req.k,
            ).data()

        if not entity_hits:
            return {"answer": "No entities indexed yet. Upload documents first.", "sources": []}

        entity_ids = [r["id"] for r in entity_hits]

        # 2. 1-hop graph neighbourhood
        neighbours = s.run(
            """
            MATCH (a:Entity)-[r:RELATES_TO]-(b:Entity)
            WHERE a.id IN $ids
            RETURN a.name AS from, r.relation AS rel, b.name AS to,
                   b.description AS to_desc
            LIMIT 60
            """,
            ids=entity_ids,
        ).data()

        # 3. Source chunks that mention these entities
        chunks = s.run(
            """
            MATCH (c:Chunk)-[:MENTIONS]->(e:Entity)
            WHERE e.id IN $ids
            WITH DISTINCT c ORDER BY c.chunk_index LIMIT 6
            RETURN c.text AS text, c.doc_id AS doc_id
            """,
            ids=entity_ids,
        ).data()

        # 4. Community context (if built)
        comm_ctx = s.run(
            """
            MATCH (e:Entity)-[:BELONGS_TO]->(comm:Community)
            WHERE e.id IN $ids
            RETURN DISTINCT comm.summary AS summary LIMIT 3
            """,
            ids=entity_ids,
        ).data()

    entity_section = "\n".join(
        f"- [{r['type']}] {r['name']}: {r['desc']}" for r in entity_hits[:6]
    )
    graph_section = "\n".join(
        f"  {r['from']} —[{r['rel']}]→ {r['to']}" for r in neighbours[:30]
    )
    chunk_section  = "\n\n---\n\n".join(c["text"] for c in chunks)
    comm_section   = "\n".join(c["summary"] for c in comm_ctx) if comm_ctx else ""

    system = (
        "You are a precise research assistant with access to a knowledge graph. "
        "Use the entities, graph relationships, and source text to answer. "
        "Cite entity names and relationships when relevant."
    )
    user_msg = f"""Relevant entities:
{entity_section}

Knowledge graph relationships:
{graph_section}

{"Community context:\n" + comm_section + chr(10) if comm_section else ""}Source text:
{chunk_section}

Question: {req.query}"""

    resp = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1200,
        system=system,
        messages=[{"role": "user", "content": user_msg}],
    )

    sources = [
        {"id": r["id"], "filename": r["name"], "text": r.get("desc", ""), "type": r["type"]}
        for r in entity_hits[:5]
    ]
    return {"answer": resp.content[0].text, "sources": sources, "mode": "local"}


async def _global_query(req: QueryRequest):
    with driver.session() as s:
        comms = s.run(
            "MATCH (c:Community) RETURN c.summary AS summary, c.size AS size "
            "ORDER BY c.size DESC LIMIT 20"
        ).data()

    if not comms:
        return {
            "answer": "No community summaries found. Build them first via POST /api/communities/build.",
            "sources": [],
            "mode": "global",
        }

    summaries = "\n\n".join(
        f"Community (size {c['size']}): {c['summary']}" for c in comms
    )
    resp = claude.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1400,
        system=(
            "You analyze a knowledge graph's community structure to answer holistic, "
            "thematic questions. Synthesize across all communities."
        ),
        messages=[{
            "role": "user",
            "content": f"Community summaries:\n{summaries}\n\nQuestion: {req.query}",
        }],
    )
    return {"answer": resp.content[0].text, "sources": [], "mode": "global"}


# ── Community detection & summarisation ───────────────────────────────────────
@app.post("/api/communities/build")
async def build_communities():
    """Louvain community detection on the entity graph, then Claude summarises each."""
    with driver.session() as s:
        entities = s.run("MATCH (e:Entity) RETURN e.id AS id, e.name AS name").data()
        rels     = s.run(
            "MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity) "
            "RETURN a.id AS src, b.id AS tgt, r.weight AS w"
        ).data()

    if len(entities) < 2:
        raise HTTPException(400, "Need at least 2 entities to detect communities.")

    # Build NetworkX graph
    G = nx.Graph()
    G.add_nodes_from(e["id"] for e in entities)
    for r in rels:
        G.add_edge(r["src"], r["tgt"], weight=float(r["w"] or 1))

    id_to_name = {e["id"]: e["name"] for e in entities}

    # Louvain partitioning (built into NetworkX ≥ 3.0)
    partitions = nx.algorithms.community.louvain_communities(G, seed=42)

    created = 0
    with driver.session() as s:
        # Clear old communities
        s.run("MATCH (c:Community) DETACH DELETE c")
        s.run("MATCH ()-[r:BELONGS_TO]->() DELETE r")

        for idx, members in enumerate(partitions):
            if len(members) < 2:
                continue
            member_names = [id_to_name.get(m, m) for m in members]

            # Generate community summary with Claude Haiku
            summary_resp = claude.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=250,
                messages=[{
                    "role": "user",
                    "content": (
                        f"These concepts form a related knowledge cluster: "
                        f"{', '.join(member_names[:25])}.\n"
                        "Write 2 concise sentences summarising what this cluster is about."
                    ),
                }],
            )
            summary = summary_resp.content[0].text.strip()
            comm_id = f"community_{idx}"

            s.run(
                "CREATE (c:Community {id: $id, summary: $summary, size: $size})",
                id=comm_id, summary=summary, size=len(members),
            )
            for eid in members:
                s.run(
                    "MATCH (e:Entity {id: $eid}), (c:Community {id: $cid}) "
                    "MERGE (e)-[:BELONGS_TO]->(c)",
                    eid=eid, cid=comm_id,
                )
            created += 1

    return {"communities_built": created}


@app.get("/api/communities")
async def list_communities():
    with driver.session() as s:
        comms = s.run(
            """
            MATCH (c:Community)
            OPTIONAL MATCH (e:Entity)-[:BELONGS_TO]->(c)
            WITH c, collect(e.name)[..8] AS sample_entities
            RETURN c.id AS id, c.summary AS summary, c.size AS size,
                   sample_entities
            ORDER BY c.size DESC
            """
        ).data()
    return {"communities": comms}


# ── Stats & delete ─────────────────────────────────────────────────────────────
@app.get("/api/stats")
async def stats():
    with driver.session() as s:
        counts = s.run(
            """
            MATCH (d:Document) WITH count(d) AS docs
            MATCH (e:Entity)   WITH docs, count(e) AS entities
            MATCH (c:Chunk)    WITH docs, entities, count(c) AS chunks
            OPTIONAL MATCH (comm:Community) WITH docs, entities, chunks, count(comm) AS communities
            RETURN docs, entities, chunks, communities
            """
        ).single()
    if not counts:
        return {"docs": 0, "entities": 0, "chunks": 0, "communities": 0}
    return dict(counts)


@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    with driver.session() as s:
        s.run(
            """
            MATCH (d:Document {id: $id})-[:HAS_CHUNK]->(c:Chunk)
            DETACH DELETE c
            """,
            id=doc_id,
        )
        s.run("MATCH (d:Document {id: $id}) DETACH DELETE d", id=doc_id)
    return {"deleted": doc_id}


# ── Serve Vite build ──────────────────────────────────────────────────────────
dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="frontend")
