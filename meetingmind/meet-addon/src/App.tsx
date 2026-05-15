import { useEffect, useState } from "react";
import { useMeetSDK } from "./hooks/useMeetSDK";
import { getMeeting } from "./lib/butterbase";
import { EnrollmentView } from "./views/EnrollmentView";
import { LiveView } from "./views/LiveView";
import { PostMeetingView } from "./views/PostMeetingView";

type MeetingStatus = "waiting" | "enrolling" | "live" | "processing" | "completed" | "failed" | null;

function useMeetingId(meetingCode: string | null) {
  const [meetingId, setMeetingId] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingCode) return;
    // Look up meetingId by meet_code from Butterbase
    const API_URL = process.env.NEXT_PUBLIC_BUTTERBASE_API_URL!;
    const API_KEY = process.env.NEXT_PUBLIC_BUTTERBASE_API_KEY!;
    const APP_ID = process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID!;
    fetch(`${API_URL}/meetings?google_meet_code=${meetingCode}&limit=1`, {
      headers: { Authorization: `Bearer ${API_KEY}`, "X-App-ID": APP_ID },
    })
      .then((r) => r.json())
      .then((rows) => rows[0]?.id && setMeetingId(rows[0].id));
  }, [meetingCode]);

  return meetingId;
}

export default function App() {
  const { meetingCode, error } = useMeetSDK();
  const meetingId = useMeetingId(meetingCode);
  const [status, setStatus] = useState<MeetingStatus>(null);

  useEffect(() => {
    if (!meetingId) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const meeting = await getMeeting(meetingId);
          if (!cancelled) setStatus(meeting.status);
          if (["completed", "failed"].includes(meeting.status)) break;
        } catch {}
        await new Promise((r) => setTimeout(r, 3000));
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [meetingId]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-center">
        <p className="text-xs text-[#6C7278]">Could not connect to Meet SDK: {error}</p>
      </div>
    );
  }

  if (!meetingId || !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <div className="h-6 w-6 border-2 border-[#B8422E] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-[#6C7278]">Connecting to MeetingMind…</p>
      </div>
    );
  }

  if (status === "enrolling") {
    return <EnrollmentView meetingId={meetingId} onEnrolled={() => setStatus("live")} />;
  }

  if (status === "live") {
    return <LiveView meetingId={meetingId} />;
  }

  if (status === "processing" || status === "completed") {
    return <PostMeetingView meetingId={meetingId} />;
  }

  return (
    <div className="flex items-center justify-center h-full p-6 text-center">
      <p className="text-xs text-[#6C7278]">Waiting for meeting to start…</p>
    </div>
  );
}
