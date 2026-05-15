import { useEffect, useRef, useState } from "react";
import { useButterbaseRealtime } from "../hooks/useButterbaseRealtime";
import { FaceBox } from "../components/FaceBox";
import { TranscriptLine } from "../components/TranscriptLine";
import { ActiveSpeakerBadge } from "../components/ActiveSpeakerBadge";

interface OverlayEntry {
  trackId: string;
  personId: string | null;
  name: string;
  bbox: { x: number; y: number; w: number; h: number };
  isSpeaking: boolean;
}

interface TranscriptSegment {
  id: string;
  personName: string;
  startTimeMs: number;
  text: string;
}

interface Props {
  meetingId: string;
}

export function LiveView({ meetingId }: Props) {
  const [overlay, setOverlay] = useState<OverlayEntry[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useButterbaseRealtime<{ overlay: OverlayEntry[] }>(
    "active_speaker",
    meetingId,
    ({ overlay }) => setOverlay(overlay)
  );

  useButterbaseRealtime<TranscriptSegment>(
    "live_transcript",
    meetingId,
    (seg) => setSegments((prev) => [...prev.slice(-199), seg])
  );

  // Auto-scroll transcript
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments]);

  const activeSpeaker = overlay.find((o) => o.isSpeaking);

  return (
    <div className="flex flex-col h-full bg-[#F7F5F2]">
      {/* Video feed overlay */}
      <div className="relative bg-[#1A1C1E] aspect-video w-full overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-[#6C7278] text-xs">
          {/* In production this renders the actual video stream */}
          Live feed
        </div>
        {overlay.map((entry) => (
          <FaceBox
            key={entry.trackId}
            x={entry.bbox.x}
            y={entry.bbox.y}
            w={entry.bbox.w}
            h={entry.bbox.h}
            name={entry.name}
            isActive={entry.isSpeaking}
          />
        ))}
      </div>

      {/* Active speaker badge */}
      <div className="px-3 py-2">
        {activeSpeaker ? (
          <ActiveSpeakerBadge name={activeSpeaker.name} />
        ) : (
          <div className="h-10 flex items-center px-3">
            <span className="text-xs text-[#6C7278]">Listening…</span>
          </div>
        )}
      </div>

      {/* Live transcript */}
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto border-t border-[#6C7278]/20 bg-white"
      >
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-[#6C7278]">
            Transcript will appear here…
          </div>
        ) : (
          segments.map((seg) => (
            <TranscriptLine
              key={seg.id}
              speakerName={seg.personName}
              startTimeMs={seg.startTimeMs}
              text={seg.text}
            />
          ))
        )}
      </div>
    </div>
  );
}
