import { useState, useEffect } from "react";
import { getMeetingCode } from "../lib/meet-sdk";

export function useMeetSDK() {
  const [meetingCode, setMeetingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMeetingCode()
      .then(setMeetingCode)
      .catch((e) => setError(e.message));
  }, []);

  return { meetingCode, error };
}
