const API_URL = process.env.NEXT_PUBLIC_BUTTERBASE_API_URL!;
const API_KEY = process.env.NEXT_PUBLIC_BUTTERBASE_API_KEY!;
const APP_ID = process.env.NEXT_PUBLIC_BUTTERBASE_APP_ID!;

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "X-App-ID": APP_ID,
  "Content-Type": "application/json",
});

export async function getMeeting(meetingId: string) {
  const res = await fetch(`${API_URL}/meetings/${meetingId}`, { headers: headers() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getTranscriptSegments(meetingId: string) {
  const res = await fetch(
    `${API_URL}/transcript_segments?meeting_id=${meetingId}&order=start_time_ms.asc`,
    { headers: headers() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitEnrollment(meetingId: string, faces: Array<{ trackId: string; name: string; personId?: string }>) {
  const res = await fetch(`${API_URL}/meetings/${meetingId}/enrollment`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ faces }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function subscribeRealtime(channel: string, meetingId: string, onMessage: (data: unknown) => void): () => void {
  const url = `${API_URL}/realtime/${channel}?meeting_id=${meetingId}&apikey=${API_KEY}`;
  const ws = new WebSocket(url);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onerror = (e) => console.error("[butterbase realtime]", e);
  return () => ws.close();
}
