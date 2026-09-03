import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StickyNote, Bookmark as BookmarkIcon } from "lucide-react";
import api from "../../services/api";

interface VideoUrlResponse {
  url: string;
}

interface Note {
  id: string;
  lecture_id: string;
  timestamp_seconds: number;
  content: string;
  created_at: string;
}

interface Bookmark {
  id: string;
  lecture_id: string;
  timestamp_seconds: number;
  created_at: string;
}

// Formats seconds as m:ss, for showing note/bookmark timestamps readably
function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function CoursePlayer() {
  const { lectureId } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();

  // Tracks the last watched_seconds value we sent to the backend, so the
  // timeupdate handler (which fires very frequently) only actually
  // triggers a network request every ~10 seconds of playback.
  const lastReportedRef = useRef(0);

  const [noteContent, setNoteContent] = useState("");

  const { data, isLoading, error } = useQuery<VideoUrlResponse>({
    queryKey: ["lecture-video", lectureId],
    queryFn: async () => {
      const response = await api.get(`/courses/lectures/${lectureId}/video-url`);
      return response.data;
    },
    enabled: !!lectureId,
    staleTime: 55 * 60 * 1000, // presigned URL is valid 1hr server-side; treat it as fresh
    refetchOnWindowFocus: false, // don't regenerate the URL (and restart playback) on tab refocus
  });

  // Fetches this user's existing notes for this lecture on mount — this is
  // what fixes the "everything disappears on refresh" gap. Same pattern
  // Dashboard/CourseCatalog already use for server state.
  const { data: notesData } = useQuery<{ notes: Note[] }>({
    queryKey: ["lecture-notes", lectureId],
    queryFn: async () => {
      const response = await api.get(`/lectures/${lectureId}/notes`);
      return response.data;
    },
    enabled: !!lectureId,
  });

  const { data: bookmarksData } = useQuery<{ bookmarks: Bookmark[] }>({
    queryKey: ["lecture-bookmarks", lectureId],
    queryFn: async () => {
      const response = await api.get(`/lectures/${lectureId}/bookmarks`);
      return response.data;
    },
    enabled: !!lectureId,
  });

  const notes = notesData?.notes ?? [];
  const bookmarks = bookmarksData?.bookmarks ?? [];

  // Silent background mutation — no loading/error UI needed for this one,
  // since the student never directly triggers it.
  const progressMutation = useMutation({
    mutationFn: async (payload: { watched_seconds: number; completed: boolean }) => {
      await api.post(`/lectures/${lectureId}/progress`, payload);
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (payload: { timestamp_seconds: number; content: string }) => {
      const response = await api.post<{ note: Note }>(`/lectures/${lectureId}/notes`, payload);
      return response.data.note;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lecture-notes", lectureId] });
      setNoteContent("");
    },
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (payload: { timestamp_seconds: number }) => {
      const response = await api.post<{ bookmark: Bookmark }>(
        `/lectures/${lectureId}/bookmarks`,
        payload
      );
      return response.data.bookmark;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lecture-bookmarks", lectureId] });
    },
  });

  // Fires on every native timeupdate event. Throttled so we only report
  // progress once per ~10 seconds of actual playback, not continuously.
  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    const currentSecond = Math.floor(video.currentTime);
    if (currentSecond - lastReportedRef.current >= 10) {
      lastReportedRef.current = currentSecond;
      progressMutation.mutate({ watched_seconds: currentSecond, completed: false });
    }
  }

  // Fires when the video finishes — marks the lecture complete regardless
  // of the 10-second throttle above.
  function handleEnded() {
    const video = videoRef.current;
    if (!video) return;

    const finalSecond = Math.floor(video.duration || video.currentTime);
    lastReportedRef.current = finalSecond;
    progressMutation.mutate({ watched_seconds: finalSecond, completed: true });
  }

  function handleAddNote() {
    const video = videoRef.current;
    if (!video || noteContent.trim() === "") return;

    noteMutation.mutate({
      timestamp_seconds: Math.floor(video.currentTime),
      content: noteContent.trim(),
    });
  }

  function handleAddBookmark() {
    const video = videoRef.current;
    if (!video) return;

    bookmarkMutation.mutate({ timestamp_seconds: Math.floor(video.currentTime) });
  }

  if (isLoading) {
    return <p className="text-muted text-sm">Loading video...</p>;
  }

  if (error) {
    return <p className="text-danger text-sm">Failed to load video.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
        Lecture Player
      </h1>

      {data?.url ? (
        <>
          <video
            ref={videoRef}
            controls
            src={data.url}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            className="w-full rounded-xl shadow-md bg-black"
          >
            Your browser does not support video playback.
          </video>

          <button
            type="button"
            onClick={handleAddBookmark}
            disabled={bookmarkMutation.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-white shadow-md px-4 py-2 text-sm font-medium text-gray-700 hover:shadow-xl hover:-translate-y-1 transition"
          >
            <BookmarkIcon size={16} />
            Bookmark this moment
          </button>

          {bookmarks.length > 0 && (
            <ul className="mt-2 text-sm text-muted">
              {bookmarks.map((b) => (
                <li key={b.id}>Bookmarked at {formatTime(b.timestamp_seconds)}</li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-2xl shadow-md bg-white p-4">
            <h2 className="flex items-center gap-2 font-semibold text-gray-900 mb-3">
              <StickyNote size={18} />
              Notes
            </h2>

            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Add a note at the current timestamp..."
              className="w-full rounded-lg border border-gray-200 p-2 text-sm"
              rows={3}
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={noteMutation.isPending || noteContent.trim() === ""}
              className="mt-2 rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Add note
            </button>

            {notes.length > 0 && (
              <ul className="mt-4 space-y-2">
                {notes.map((note) => (
                  <li key={note.id} className="text-sm">
                    <span className="text-link font-medium">
                      {formatTime(note.timestamp_seconds)}
                    </span>{" "}
                    — {note.content}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="text-muted text-sm">No video available for this lecture.</p>
      )}
    </div>
  );
}