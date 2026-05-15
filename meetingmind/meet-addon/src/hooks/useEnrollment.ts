import { useState, useCallback } from "react";
import { submitEnrollment } from "../lib/butterbase";
import { useButterbaseRealtime } from "./useButterbaseRealtime";

export interface FaceEntry {
  trackId: string;
  faceCropUrl: string;
  suggestedName: string | null;
  suggestedPersonId: string | null;
  name: string;
}

interface EnrollmentStatusMessage {
  meeting_id: string;
  faces: Array<{
    track_id: string;
    face_crop_b64: string;
    suggested_name: string | null;
    suggested_person_id: string | null;
  }>;
}

export function useEnrollment(meetingId: string | null) {
  const [faces, setFaces] = useState<FaceEntry[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useButterbaseRealtime<EnrollmentStatusMessage>(
    "enrollment_status",
    meetingId,
    useCallback((msg) => {
      setFaces(
        msg.faces.map((f) => ({
          trackId: f.track_id,
          faceCropUrl: `data:image/jpeg;base64,${f.face_crop_b64}`,
          suggestedName: f.suggested_name,
          suggestedPersonId: f.suggested_person_id,
          name: f.suggested_name ?? "",
        }))
      );
    }, [])
  );

  const updateName = useCallback((trackId: string, name: string) => {
    setFaces((prev) =>
      prev.map((f) => (f.trackId === trackId ? { ...f, name } : f))
    );
  }, []);

  const submit = useCallback(async () => {
    if (!meetingId) return;
    setSubmitting(true);
    try {
      await submitEnrollment(
        meetingId,
        faces.map((f) => ({
          trackId: f.trackId,
          name: f.name,
          personId: f.suggestedPersonId ?? undefined,
        }))
      );
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }, [meetingId, faces]);

  return { faces, updateName, submit, submitted, submitting };
}
