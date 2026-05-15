/**
 * Server-side Butterbase client — uses the secret API key, never sent to browser.
 * Call from Server Components and API Routes only.
 */
const API_URL = process.env.BUTTERBASE_API_URL!;
const API_KEY  = process.env.BUTTERBASE_API_KEY!;
const APP_ID   = process.env.BUTTERBASE_APP_ID!;

const H = () => ({
  Authorization: `Bearer ${API_KEY}`,
  "X-App-ID": APP_ID,
  "Content-Type": "application/json",
});

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: H(), next: { revalidate: 10 } });
  if (!res.ok) throw new Error(`Butterbase GET ${path} → ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: H(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Butterbase POST ${path} → ${res.status}`);
  return res.json();
}

// ── Meetings ──────────────────────────────────────────────────────────────────
export const getMeetings = (orgId: string) =>
  get<Meeting[]>("/meetings", { org_id: orgId, order: "scheduled_start.desc" });

export const getMeeting = (id: string) => get<Meeting>(`/meetings/${id}`);

// ── Persons ───────────────────────────────────────────────────────────────────
export const getPersons = (orgId: string) =>
  get<Person[]>("/persons", { org_id: orgId, order: "name.asc" });

export const getPerson = (id: string) => get<Person>(`/persons/${id}`);

// ── Transcript ────────────────────────────────────────────────────────────────
export const getTranscript = (meetingId: string) =>
  get<TranscriptSegment[]>("/transcript_segments", {
    meeting_id: meetingId,
    order: "start_time_ms.asc",
  });

// ── MOMs ──────────────────────────────────────────────────────────────────────
export const getMom = (meetingId: string) =>
  get<Mom[]>("/moms", { meeting_id: meetingId }).then((rows) => rows[0] ?? null);

// ── KPIs ──────────────────────────────────────────────────────────────────────
export const getMeetingKpis = (meetingId: string) =>
  get<ParticipantKpi[]>("/participant_kpis", { meeting_id: meetingId });

export const getPersonKpis = (personId: string) =>
  get<ParticipantKpi[]>("/participant_kpis", { person_id: personId, order: "created_at.desc", limit: "20" });

// ── Action items ──────────────────────────────────────────────────────────────
export const getPersonActionItems = (personId: string) =>
  get<ActionItem[]>("/action_items", { assigned_to_person_id: personId, order: "created_at.desc" });

export const getOrgStats = async (orgId: string) => {
  const [meetings, actionItems] = await Promise.all([
    get<Meeting[]>("/meetings", { org_id: orgId, status: "completed", order: "created_at.desc", limit: "20" }),
    get<ActionItem[]>("/action_items", { status: "pending" }),
  ]);
  return { meetings, pendingActionItems: actionItems.length };
};

// ── RAG search (for executive Q&A) ───────────────────────────────────────────
export const ragSearch = (query: string, orgId: string) =>
  post<{ results: RagResult[] }>("/rag/meeting_transcripts/search", { query, top_k: 10, filter: { org_id: orgId } });

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Meeting {
  id: string;
  org_id: string;
  title: string;
  google_meet_code: string;
  scheduled_start: string;
  actual_start: string | null;
  actual_end: string | null;
  duration_seconds: number | null;
  participant_count: number | null;
  status: "waiting" | "enrolling" | "live" | "processing" | "completed" | "failed";
  settings: { stakeholder_emails?: string[] };
  created_at: string;
}

export interface Person {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  role: string | null;
  team: string | null;
  face_crop_url: string | null;
  face_enrolled: boolean;
  voice_enrolled: boolean;
  created_at: string;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  person_id: string | null;
  speaker_label: string;
  start_time_ms: number;
  end_time_ms: number;
  text: string;
  confidence: number | null;
  person_name?: string;
}

export interface Mom {
  id: string;
  meeting_id: string;
  summary: string;
  structured_mom: {
    title: string;
    date: string;
    duration_minutes: number;
    attendees: { name: string; role?: string }[];
    executive_summary: string;
    agenda_items: { topic: string; summary: string; key_points: string[]; raised_by: string }[];
    decisions: { description: string; decided_by: string[]; context: string }[];
    action_items: { description: string; assigned_to: string; deadline: string; priority: string }[];
    follow_ups: { topic: string; suggested_date: string | null }[];
  };
  sent_at: string | null;
}

export interface ParticipantKpi {
  id: string;
  meeting_id: string;
  person_id: string;
  talk_time_seconds: number;
  talk_ratio: number;
  interruption_count: number;
  questions_asked: number;
  statements_made: number;
  action_items_assigned: number;
  sentiment_score: number;
  engagement_score: number;
  key_topics: string[];
  created_at: string;
  person_name?: string;
  meeting_title?: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  mom_id: string;
  assigned_to_person_id: string | null;
  description: string;
  deadline: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
}

export interface RagResult {
  content: string;
  metadata: { meeting_id: string; meeting_title: string; date: string; person_id: string };
  score: number;
}
