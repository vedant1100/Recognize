"""
Query agent — on-demand executive Q&A.
Parallel retrieval from EverOS + Butterbase RAG, then Claude synthesis with citations.
"""
import os
import agentfield as af
from anthropic import AsyncAnthropic

from retrieval import retrieve

llm = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

app = af.App("query-agent")

SYSTEM_PROMPT = """You are MeetingMind's executive knowledge assistant. You have access to \
speaker-attributed transcripts from all company meetings. Answer the user's question using \
ONLY the provided context. Cite your sources precisely: [Meeting: {title}, {date}]. \
If the context doesn't contain enough information to answer, say so clearly."""


def _build_context(everos_memories: list[dict], rag_results: list[dict]) -> str:
    parts = []

    if everos_memories:
        parts.append("=== Key Facts (from meeting knowledge base) ===")
        for mem in everos_memories:
            parts.append(f"- {mem.get('content', '')} [Meeting: {mem.get('source_meeting_id', 'unknown')}]")

    if rag_results:
        parts.append("\n=== Relevant Transcript Excerpts ===")
        for r in rag_results:
            meta = r.get("metadata", {})
            parts.append(
                f"[{meta.get('meeting_title', 'Unknown Meeting')}, {meta.get('date', '')}] {r['content']}"
            )

    return "\n".join(parts)


@app.reasoner()
async def answer(question: str, org_id: str) -> dict:
    context_data = await retrieve(question, org_id)
    context = _build_context(
        context_data["everos_memories"],
        context_data["rag_results"],
    )

    if not context.strip():
        return {
            "answer": "I couldn't find relevant information in the meeting knowledge base for this question.",
            "citations": [],
        }

    response = await llm.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"}],
    )

    answer_text = response.content[0].text

    # Extract citations from context metadata
    citations = [
        {"meeting_id": r["metadata"].get("meeting_id"), "title": r["metadata"].get("meeting_title"),
         "date": r["metadata"].get("date")}
        for r in context_data["rag_results"]
        if r.get("metadata")
    ]

    return {"answer": answer_text, "citations": citations, "question": question}


if __name__ == "__main__":
    app.run()
