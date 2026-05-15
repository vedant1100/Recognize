import Link from "next/link";
import { getMeetings } from "../../lib/butterbase";
import { getMom } from "../../lib/butterbase";

const ORG_ID = process.env.DEFAULT_ORG_ID!;

export default async function KnowledgePage() {
  const meetings = await getMeetings(ORG_ID);
  const completed = meetings.filter((m) => m.status === "completed").slice(0, 10);

  const momsSettled = await Promise.allSettled(completed.map((m) => getMom(m.id)));
  const moms = momsSettled
    .map((r, i) => ({ meeting: completed[i], mom: r.status === "fulfilled" ? r.value : null }))
    .filter((x) => x.mom != null);

  // Collect all decisions across meetings
  const allDecisions = moms.flatMap(({ meeting, mom }) =>
    (mom!.structured_mom.decisions ?? []).map((d) => ({ ...d, meetingTitle: meeting.title, meetingId: meeting.id }))
  );

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-ink mb-1">Knowledge Base</h1>
          <p className="text-sm text-slate">Decisions and insights extracted from all meetings.</p>
        </div>
        <Link
          href="/knowledge/query"
          className="px-4 py-2 bg-ink text-white text-sm rounded-sm hover:bg-clay transition-colors"
        >
          Ask a question →
        </Link>
      </div>

      {allDecisions.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs text-slate uppercase tracking-widest"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}>Recent Decisions</h2>
          {allDecisions.map((d, i) => (
            <div key={i} className="bg-white border border-slate/20 rounded-md px-5 py-4">
              <p className="text-sm text-ink mb-2">{d.description}</p>
              <div className="flex items-center gap-3">
                {d.decided_by?.length > 0 && (
                  <span className="text-xs text-slate">By: {d.decided_by.join(", ")}</span>
                )}
                <Link href={`/meetings/${d.meetingId}`}
                      className="text-xs text-clay hover:underline">{d.meetingTitle}</Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-sm text-slate mb-4">No meeting decisions found yet.</p>
          <Link href="/knowledge/query"
                className="text-sm text-clay hover:underline">Try asking a question →</Link>
        </div>
      )}
    </div>
  );
}
