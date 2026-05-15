import { useEffect, useState } from "react";
import { getMeeting } from "../lib/butterbase";

interface Props {
  meetingId: string;
}

export function PostMeetingView({ meetingId }: Props) {
  const [meeting, setMeeting] = useState<{ title?: string; status?: string } | null>(null);

  useEffect(() => {
    getMeeting(meetingId).then(setMeeting);
  }, [meetingId]);

  const isProcessing = meeting?.status === "processing";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center bg-[#F7F5F2]">
      {isProcessing ? (
        <>
          <div className="h-8 w-8 border-2 border-[#B8422E] border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-sm font-semibold text-[#1A1C1E]">Generating Minutes…</p>
            <p className="text-xs text-[#6C7278] mt-1">
              MOM, KPIs, and knowledge graph are being processed.
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="h-10 w-10 rounded-full bg-[#1A1C1E] flex items-center justify-center">
            <span className="text-white text-lg">✓</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1C1E]">Meeting Complete</p>
            <p className="text-xs text-[#6C7278] mt-1">
              Minutes of Meeting have been sent to all stakeholders.
            </p>
          </div>
          <a
            href={`${process.env.NEXT_PUBLIC_DASHBOARD_URL}/meetings/${meetingId}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[#B8422E] underline"
          >
            View full report in dashboard →
          </a>
        </>
      )}
    </div>
  );
}
