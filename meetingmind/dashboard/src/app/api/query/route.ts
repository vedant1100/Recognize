/**
 * POST /api/query
 * Server-side API route — calls the AgentField query-agent, then returns the answer.
 * Keeps AGENTFIELD_CONTROL_PLANE_URL and BUTTERBASE_API_KEY out of the browser.
 */
import { NextRequest, NextResponse } from "next/server";
import { ragSearch } from "../../../lib/butterbase";

const AGENTFIELD_URL = process.env.AGENTFIELD_CONTROL_PLANE_URL!;
const ORG_ID = process.env.DEFAULT_ORG_ID!;

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question?.trim()) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  try {
    // Call query-agent via AgentField HTTP API
    const agentRes = await fetch(`${AGENTFIELD_URL}/agents/query-agent/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ function: "answer", args: { question, org_id: ORG_ID } }),
    });

    if (agentRes.ok) {
      const data = await agentRes.json();
      return NextResponse.json(data);
    }
  } catch {
    // AgentField unavailable — fall back to direct Butterbase RAG
  }

  // Fallback: Butterbase RAG search only (no EverOS, no LLM synthesis)
  const { results } = await ragSearch(question, ORG_ID);
  const answer = results.length
    ? `Based on meeting transcripts:\n\n${results.slice(0, 3).map((r) => `• ${r.content}`).join("\n")}`
    : "I couldn't find relevant information in the meeting knowledge base.";

  return NextResponse.json({
    answer,
    citations: results.map((r) => ({
      meeting_id: r.metadata.meeting_id,
      title: r.metadata.meeting_title,
      date: r.metadata.date,
    })),
  });
}
