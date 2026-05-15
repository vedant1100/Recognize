import { getMeetings, getMeetingKpis, getPersons } from "../../lib/butterbase";
import type { ParticipantKpi, Person } from "../../lib/butterbase";
import { TeamKpiChart } from "../../components/TeamKpiChart";

const ORG_ID = process.env.DEFAULT_ORG_ID!;

export default async function KpiPage() {
  const [meetings, persons] = await Promise.all([
    getMeetings(ORG_ID),
    getPersons(ORG_ID),
  ]);

  const completedMeetings = meetings.filter((m) => m.status === "completed").slice(0, 5);

  const allKpis: ParticipantKpi[] = (
    await Promise.all(completedMeetings.map((m) => getMeetingKpis(m.id)))
  ).flat();

  const personMap = Object.fromEntries(persons.map((p) => [p.id, p])) as Record<string, Person>;

  // Aggregate per person across meetings
  const byPerson: Record<string, { name: string; avgTalkRatio: number; avgEngagement: number; totalActionItems: number; avgSentiment: number }> = {};
  for (const kpi of allKpis) {
    const name = personMap[kpi.person_id]?.name ?? "Unknown";
    if (!byPerson[kpi.person_id]) {
      byPerson[kpi.person_id] = { name, avgTalkRatio: 0, avgEngagement: 0, totalActionItems: 0, avgSentiment: 0 };
    }
    byPerson[kpi.person_id].avgTalkRatio += kpi.talk_ratio;
    byPerson[kpi.person_id].avgEngagement += kpi.engagement_score;
    byPerson[kpi.person_id].totalActionItems += kpi.action_items_assigned;
    byPerson[kpi.person_id].avgSentiment += kpi.sentiment_score;
  }
  const counts: Record<string, number> = {};
  for (const kpi of allKpis) {
    counts[kpi.person_id] = (counts[kpi.person_id] ?? 0) + 1;
  }
  const chartData = Object.entries(byPerson).map(([pid, d]) => ({
    name: d.name,
    talkRatio: Math.round((d.avgTalkRatio / counts[pid]) * 100),
    engagement: Math.round((d.avgEngagement / counts[pid]) * 100),
    actionItems: d.totalActionItems,
    sentiment: Math.round((d.avgSentiment / counts[pid]) * 100),
  }));

  return (
    <div className="p-8">
      <h1 className="text-3xl font-semibold text-ink mb-2">KPI Dashboard</h1>
      <p className="text-sm text-slate mb-8">Aggregated across the last {completedMeetings.length} completed meetings.</p>

      {chartData.length > 0 ? (
        <div className="flex flex-col gap-8">
          <div className="bg-white border border-slate/20 rounded-md p-6">
            <p className="text-xs text-slate uppercase tracking-widest mb-4"
               style={{ fontFamily: "Space Grotesk, sans-serif" }}>Talk ratio &amp; engagement (%)</p>
            <TeamKpiChart data={chartData} />
          </div>

          {/* Table */}
          <div className="bg-white border border-slate/20 rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate/20">
                <tr>
                  {["Person", "Avg talk %", "Avg engagement", "Total action items", "Avg sentiment"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[10px] text-slate uppercase tracking-widest font-medium"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.sort((a, b) => b.talkRatio - a.talkRatio).map((row) => (
                  <tr key={row.name} className="border-b border-slate/10">
                    <td className="px-5 py-3 font-medium text-ink">{row.name}</td>
                    <td className="px-5 py-3 text-slate">{row.talkRatio}%</td>
                    <td className="px-5 py-3 text-slate">{row.engagement}%</td>
                    <td className="px-5 py-3 text-slate">{row.actionItems}</td>
                    <td className="px-5 py-3 text-slate">{row.sentiment > 0 ? "+" : ""}{row.sentiment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate text-center py-16">No completed meetings with KPI data yet.</p>
      )}
    </div>
  );
}
