import { getMeeting, getTranscript, getMom, getMeetingKpis } from "../../../lib/butterbase";
import { format } from "date-fns";
import { KpiBar } from "../../../components/KpiBar";
import { TranscriptView } from "../../../components/TranscriptView";

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const [meeting, transcript, mom, kpis] = await Promise.all([
    getMeeting(params.id),
    getTranscript(params.id),
    getMom(params.id),
    getMeetingKpis(params.id),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <p className="text-xs text-slate mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
        {format(new Date(meeting.scheduled_start), "MMMM d, yyyy · h:mm a")}
        {meeting.duration_seconds != null && ` · ${Math.round(meeting.duration_seconds / 60)} min`}
        {meeting.participant_count != null && ` · ${meeting.participant_count} people`}
      </p>
      <h1 className="text-3xl font-semibold text-ink mb-8">{meeting.title || "Meeting"}</h1>

      {/* Tabs via sections */}
      <div className="flex flex-col gap-10">

        {/* MOM */}
        {mom && (
          <section>
            <h2 className="section-header">Minutes of Meeting</h2>
            <div className="bg-white border border-slate/20 rounded-md p-6">
              <p className="text-sm text-ink leading-relaxed mb-6">{mom.structured_mom.executive_summary}</p>

              {mom.structured_mom.decisions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs text-slate uppercase tracking-widest mb-3"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}>Decisions</h3>
                  <ul className="flex flex-col gap-2">
                    {mom.structured_mom.decisions.map((d, i) => (
                      <li key={i} className="text-sm text-ink border-l-2 border-clay pl-3">{d.description}</li>
                    ))}
                  </ul>
                </div>
              )}

              {mom.structured_mom.action_items.length > 0 && (
                <div>
                  <h3 className="text-xs text-slate uppercase tracking-widest mb-3"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}>Action Items</h3>
                  <div className="flex flex-col gap-2">
                    {mom.structured_mom.action_items.map((a, i) => (
                      <div key={i} className="flex items-start justify-between gap-4 text-sm border-b border-slate/10 pb-2">
                        <div>
                          <span className="font-medium text-ink">{a.assigned_to}: </span>
                          <span className="text-slate">{a.description}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                            a.priority === "high" ? "bg-clay/10 text-clay" :
                            a.priority === "medium" ? "bg-yellow-100 text-yellow-800" :
                            "bg-slate/10 text-slate"
                          }`}>{a.priority}</span>
                          <span className="text-xs text-slate">{a.deadline}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* KPIs */}
        {kpis.length > 0 && (
          <section>
            <h2 className="section-header">Participation KPIs</h2>
            <div className="bg-white border border-slate/20 rounded-md p-6 flex flex-col gap-4">
              {kpis.map((kpi) => (
                <KpiBar key={kpi.id} kpi={kpi} />
              ))}
            </div>
          </section>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <section>
            <h2 className="section-header">Transcript</h2>
            <TranscriptView segments={transcript} />
          </section>
        )}
      </div>
    </div>
  );
}
