import { getPerson, getPersonKpis, getPersonActionItems } from "../../../lib/butterbase";
import { KpiTrendChart } from "../../../components/KpiTrendChart";
import { format } from "date-fns";

export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  const [person, kpis, actionItems] = await Promise.all([
    getPerson(params.id),
    getPersonKpis(params.id),
    getPersonActionItems(params.id),
  ]);

  const pendingItems = actionItems.filter((a) => a.status === "pending");
  const completedItems = actionItems.filter((a) => a.status === "completed");

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-5 mb-8">
        {person.face_crop_url ? (
          <img src={person.face_crop_url} alt={person.name} className="h-16 w-16 rounded-md object-cover" />
        ) : (
          <div className="h-16 w-16 rounded-md bg-ink flex items-center justify-center text-white text-2xl font-semibold">
            {person.name[0]}
          </div>
        )}
        <div>
          <h1 className="text-3xl font-semibold text-ink">{person.name}</h1>
          <p className="text-sm text-slate mt-0.5">
            {[person.role, person.team].filter(Boolean).join(" · ")}
            {person.email && ` · ${person.email}`}
          </p>
          <div className="flex gap-2 mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-sm font-medium ${person.face_enrolled ? "bg-green-100 text-green-700" : "bg-slate/10 text-slate"}`}>
              Face {person.face_enrolled ? "enrolled" : "not enrolled"}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-sm font-medium ${person.voice_enrolled ? "bg-green-100 text-green-700" : "bg-slate/10 text-slate"}`}>
              Voice {person.voice_enrolled ? "enrolled" : "not enrolled"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-10">
        {/* KPI trend chart */}
        {kpis.length > 0 && (
          <section>
            <h2 className="section-header">Participation Over Time</h2>
            <div className="bg-white border border-slate/20 rounded-md p-6">
              <KpiTrendChart kpis={kpis} />
            </div>
          </section>
        )}

        {/* Action items */}
        {actionItems.length > 0 && (
          <section>
            <h2 className="section-header">Action Items</h2>
            <div className="flex flex-col gap-2">
              {[...pendingItems, ...completedItems].map((item) => (
                <div
                  key={item.id}
                  className={`bg-white border rounded-md px-4 py-3 flex items-start justify-between gap-4 ${
                    item.status === "completed" ? "border-slate/10 opacity-60" : "border-slate/20"
                  }`}
                >
                  <p className={`text-sm ${item.status === "completed" ? "line-through text-slate" : "text-ink"}`}>
                    {item.description}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.deadline && (
                      <span className="text-xs text-slate">{format(new Date(item.deadline), "MMM d")}</span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${
                      item.status === "completed" ? "bg-green-100 text-green-700" : "bg-clay/10 text-clay"
                    }`}>{item.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key topics */}
        {kpis[0]?.key_topics?.length > 0 && (
          <section>
            <h2 className="section-header">Common Topics</h2>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(kpis.flatMap((k) => k.key_topics))).map((t) => (
                <span key={t} className="text-sm bg-white border border-slate/20 rounded-sm px-3 py-1 text-slate">{t}</span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
