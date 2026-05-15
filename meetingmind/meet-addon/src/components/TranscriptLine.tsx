const SPEAKER_COLORS = [
  "#B8422E", "#2E6CB8", "#2E8B57", "#8B572E", "#6B2E8B", "#2E8B8B",
];

function speakerColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length];
}

function formatTimestamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

const ACTION_ITEM_RE = /\b(will|i'll|i will|action:|todo:|follow.?up:?)\b/i;

interface Props {
  speakerName: string;
  startTimeMs: number;
  text: string;
}

export function TranscriptLine({ speakerName, startTimeMs, text }: Props) {
  const isAction = ACTION_ITEM_RE.test(text);
  return (
    <div className={`px-3 py-2 border-b border-[#6C7278]/10 ${isAction ? "bg-yellow-50" : ""}`}>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span
          className="text-xs font-semibold"
          style={{ color: speakerColor(speakerName), fontFamily: "Space Grotesk, sans-serif" }}
        >
          {speakerName}
        </span>
        <span className="text-[10px] text-[#6C7278]">{formatTimestamp(startTimeMs)}</span>
        {isAction && (
          <span className="ml-auto text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-sm font-medium">
            Action
          </span>
        )}
      </div>
      <p className={`text-sm text-[#1A1C1E] leading-snug ${isAction ? "font-medium" : ""}`}>{text}</p>
    </div>
  );
}
