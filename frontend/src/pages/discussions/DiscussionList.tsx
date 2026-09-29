import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";

interface Thread {
  id: string;
  title: string;
  created_at: string;
  created_by_name: string | null;
  post_count: number;
}

export default function DiscussionList() {
  const { courseId } = useParams();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [feedback, setFeedback] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["discussion-threads", courseId],
    queryFn: async () => {
      const response = await api.get<{ threads: Thread[] }>(
        `/courses/${courseId}/threads`,
      );
      return response.data.threads;
    },
    enabled: !!courseId,
  });

  const createThreadMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/courses/${courseId}/threads`, {
        title: newTitle,
        content: newContent,
      });
      return response.data;
    },
    onSuccess: () => {
      setNewTitle("");
      setNewContent("");
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["discussion-threads", courseId] });
    },
    onError: () => {
      setFeedback("Could not start the discussion. Please try again.");
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading discussion...</p>;

  if (error) {
    const status = (error as any)?.response?.status;
    if (status === 403) {
      return (
        <p className="text-danger text-sm">
          You must be enrolled in this course to view its discussion forum.
        </p>
      );
    }
    return <p className="text-danger text-sm">Failed to load discussion.</p>;
  }

  const threads = data ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
        💬 Discussion
      </h1>

      <div className="rounded-2xl shadow-md bg-white p-4 mb-6">
        <p className="font-medium text-gray-900 mb-2">Start a new discussion</p>
        <input
          type="text"
          placeholder="Title, e.g. Why is Big-O ignoring constants?"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm mb-2"
        />
        <textarea
          placeholder="What's your question or topic?"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm mb-2"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => createThreadMutation.mutate()}
            disabled={
              newTitle.trim() === "" ||
              newContent.trim() === "" ||
              createThreadMutation.isPending
            }
            className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {createThreadMutation.isPending ? "Posting..." : "Start Discussion"}
          </button>
          {feedback && <p className="text-sm text-danger">{feedback}</p>}
        </div>
      </div>

      {threads.length === 0 ? (
        <p className="text-sm text-muted">
          No discussions yet — be the first to start one!
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              to={`/threads/${thread.id}`}
              className="block bg-white border border-gray-100 rounded-xl p-4 hover:border-gray-300 transition-colors"
            >
              <p className="font-medium text-gray-900">{thread.title}</p>
              <p className="text-xs text-gray-400 mt-1">
                {thread.created_by_name ? `Started by ${thread.created_by_name} · ` : ""}
                {new Date(thread.created_at).toLocaleDateString()}
                {" · "}
                {thread.post_count} {thread.post_count === 1 ? "reply" : "replies"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}