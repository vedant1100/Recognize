import Link from "next/link";
import { getOrgStats } from "../lib/butterbase";
import type { Meeting } from "../lib/butterbase";
import { formatDistanceToNow } from "date-fns";

const ORG_ID = process.env.DEFAULT_ORG_ID!;

function StatusBadge({ status }: { status: Meeting["status"] }) {
  const map: Record<Meeting["status"], string> = {
    waiting:    "bg-slate/20 text-slate",
    enrolling:  "bg-yellow-100 text-yellow-800",
    live:       "bg-green-100 text-green-800",
    processing: "bg-blue-100 text-blue-800",
    completed:  "bg-stone border border-slate/20 text-slate",
    failed:     "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-sm uppercase tracking-wide ${map[status]}`}
          style={{ fontFamily: "Space Grotesk, sans-serif" }}>
      {status}
    </span>
  );
}

export default async function DashboardHome() {
  const { meetings, pendingActionItems } = await getOrgStats(ORG_ID);

  const thisWeek = meetings.filter((m) => {
    const d = new Date(m.actual_start ?? m.scheduled_start);
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  });

  const avgEngagement = meetings.length
    ? Math.round(
        meetings.reduce((s, m) => s + (m.participant_count ?? 0), 0) / meetings.length
      )
    : 0;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-ink mb-1">Overview</h1>
      <p className="text-sm text-slate mb-8">Your organisation's meeting intelligence at a glance.</p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Meetings this week", value: thisWeek.length },
          { label: "Avg participants",   value: avgEngagement },
          { label: "Pending action items", value: pendingActionItems },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white border border-slate/20 rounded-md p-5">
            <p className="text-[10px] text-slate uppercase tracking-widest mb-1"
               style={{ fontFamily: "Space Grotesk, sans-serif" }}>{label}</p>
            <p className="text-4xl font-semibold text-ink">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent meetings */}
      <h2 className="text-xs text-slate uppercase tracking-widest mb-3"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}>Recent Meetings</h2>
      <div className="flex flex-col gap-2">
        {meetings.slice(0, 8).map((m) => (
          <Link
            key={m.id}
            href={`/meetings/${m.id}`}
            className="flex items-center justify-between bg-white border border-slate/20 rounded-md px-5 py-3 hover:border-clay/40 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-ink">{m.title || "Untitled Meeting"}</p>
              <p className="text-xs text-slate mt-0.5">
                {formatDistanceToNow(new Date(m.scheduled_start), { addSuffix: true })}
                {m.participant_count != null && ` · ${m.participant_count} people`}
              </p>
            </div>
            <StatusBadge status={m.status} />
          </Link>
        ))}
        {meetings.length === 0 && (
          <p className="text-sm text-slate text-center py-12">No meetings yet. The bot will auto-join once it detects a calendar event.</p>
        )}
      </div>
    </div>
  );
}
