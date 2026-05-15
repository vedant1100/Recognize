import type { ParticipantKpi } from "../lib/butterbase";

interface Props { kpi: ParticipantKpi }

function Bar({ value, max = 1, color = "#B8422E" }: { value: number; max?: number; color?: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-stone rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-slate w-10 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

export function KpiBar({ kpi }: Props) {
  const name = (kpi as any).person_name ?? "Unknown";
  return (
    <div className="flex items-start gap-6 py-2 border-b border-slate/10 last:border-0">
      <p className="text-sm font-medium text-ink w-32 shrink-0">{name}</p>
      <div className="flex-1 flex flex-col gap-2">
        <div>
          <p className="text-[10px] text-slate mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>TALK RATIO</p>
          <Bar value={kpi.talk_ratio} color="#1A1C1E" />
        </div>
        <div>
          <p className="text-[10px] text-slate mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>ENGAGEMENT</p>
          <Bar value={kpi.engagement_score} color="#B8422E" />
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[10px] text-slate" style={{ fontFamily: "Space Grotesk, sans-serif" }}>QUESTIONS</p>
        <p className="text-lg font-semibold text-ink">{kpi.questions_asked}</p>
      </div>
    </div>
  );
}
