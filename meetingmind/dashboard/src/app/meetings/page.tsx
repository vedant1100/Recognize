import Link from "next/link";
import { getMeetings } from "../../lib/butterbase";
import type { Meeting } from "../../lib/butterbase";
import { format } from "date-fns";

const ORG_ID = process.env.DEFAULT_ORG_ID!;

function StatusPill({ status }: { status: Meeting["status"] }) {
  const colors: Record<Meeting["status"], string> = {
    waiting:    "text-slate",
    enrolling:  "text-yellow-700",
    live:       "text-green-700 font-semibold",
    processing: "text-blue-700",
    completed:  "text-slate",
    failed:     "text-red-700",
  };
  return <span className={`text-xs ${colors[status]}`}>{status}</span>;
}

export default async function MeetingsPage() {
  const meetings = await getMeetings(ORG_ID);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-ink mb-6">Meetings</h1>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate/20 text-left">
            {["Title", "Date", "Participants", "Duration", "Status"].map((h) => (
              <th key={h} className="pb-2 pr-6 text-[10px] text-slate uppercase tracking-widest font-medium"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {meetings.map((m) => (
            <tr key={m.id} className="border-b border-slate/10 hover:bg-white/60 transition-colors">
              <td className="py-3 pr-6">
                <Link href={`/meetings/${m.id}`} className="text-ink hover:text-clay font-medium">
                  {m.title || "Untitled"}
                </Link>
              </td>
              <td className="py-3 pr-6 text-slate">
                {format(new Date(m.scheduled_start), "MMM d, yyyy · h:mm a")}
              </td>
              <td className="py-3 pr-6 text-slate">{m.participant_count ?? "—"}</td>
              <td className="py-3 pr-6 text-slate">
                {m.duration_seconds ? `${Math.round(m.duration_seconds / 60)} min` : "—"}
              </td>
              <td className="py-3"><StatusPill status={m.status} /></td>
            </tr>
          ))}
          {meetings.length === 0 && (
            <tr>
              <td colSpan={5} className="py-16 text-center text-slate text-sm">
                No meetings yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
