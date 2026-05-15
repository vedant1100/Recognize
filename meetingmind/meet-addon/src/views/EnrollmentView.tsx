import { useEnrollment } from "../hooks/useEnrollment";
import { NameInput } from "../components/NameInput";

interface Props {
  meetingId: string;
  onEnrolled: () => void;
}

export function EnrollmentView({ meetingId, onEnrolled }: Props) {
  const { faces, updateName, submit, submitted, submitting } = useEnrollment(meetingId);

  async function handleSubmit() {
    await submit();
    onEnrolled();
  }

  if (faces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
        <div className="h-8 w-8 border-2 border-[#B8422E] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#6C7278]">Detecting faces in the room…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#F7F5F2]">
      <header className="px-4 py-3 border-b border-[#6C7278]/20 bg-white">
        <h1 className="text-sm font-semibold text-[#1A1C1E]" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          WHO'S IN THE ROOM
        </h1>
        <p className="text-xs text-[#6C7278] mt-0.5">
          {faces.length} {faces.length === 1 ? "person" : "people"} detected. Confirm names to begin tracking.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {faces.map((face) => (
          <NameInput
            key={face.trackId}
            trackId={face.trackId}
            faceCropUrl={face.faceCropUrl}
            value={face.name}
            suggestedName={face.suggestedName}
            onChange={(name) => updateName(face.trackId, name)}
          />
        ))}
      </div>

      <div className="p-3 border-t border-[#6C7278]/20 bg-white">
        <p className="text-xs text-[#6C7278] mb-2">
          Voice enrollment: each person will be prompted to say a sentence after you start tracking.
        </p>
        <button
          onClick={handleSubmit}
          disabled={submitting || faces.some((f) => !f.name.trim())}
          className="w-full py-2.5 bg-[#1A1C1E] text-white text-sm font-medium rounded-md disabled:opacity-40 hover:bg-[#B8422E] transition-colors"
        >
          {submitting ? "Starting…" : "Start Tracking"}
        </button>
      </div>
    </div>
  );
}
