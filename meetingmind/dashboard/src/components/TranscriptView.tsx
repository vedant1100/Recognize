"use client";
import type { TranscriptSegment } from "../lib/butterbase";

const COLORS = ["#B8422E","#2E6CB8","#2E8B57","#8B572E","#6B2E8B","#2E8B8B"];
const speakerColor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
};

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
}

const ACTION_RE = /\b(will|i'll|i will|action:|todo:|follow.?up:?)\b/i;

export function TranscriptView({ segments }: { segments: TranscriptSegment[] }) {
  return (
    <div className="bg-white border border-slate/20 rounded-md overflow-hidden max-h-[600px] overflow-y-auto">
      {segments.map((seg) => {
        const name = seg.person_name ?? seg.speaker_label ?? "Unknown";
        const isAction = ACTION_RE.test(seg.text);
        return (
          <div key={seg.id} className={`px-5 py-3 border-b border-slate/10 ${isAction ? "bg-yellow-50" : ""}`}>
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className="text-xs font-semibold" style={{ color: speakerColor(name), fontFamily: "Space Grotesk, sans-serif" }}>
                {name}
              </span>
              <span className="text-[10px] text-slate">{fmt(seg.start_time_ms)}</span>
              {isAction && (
                <span className="ml-auto text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-sm font-medium">
                  Action
                </span>
              )}
            </div>
            <p className={`text-sm text-ink leading-snug ${isAction ? "font-medium" : ""}`}>{seg.text}</p>
          </div>
        );
      })}
    </div>
  );
}
