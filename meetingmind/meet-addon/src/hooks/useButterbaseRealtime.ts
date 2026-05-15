import { useEffect, useRef } from "react";
import { subscribeRealtime } from "../lib/butterbase";

export function useButterbaseRealtime<T>(
  channel: string,
  meetingId: string | null,
  onMessage: (data: T) => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!meetingId) return;
    const unsubscribe = subscribeRealtime(channel, meetingId, (data) =>
      onMessageRef.current(data as T)
    );
    return unsubscribe;
  }, [channel, meetingId]);
}
