import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";

interface Post {
  id: string;
  user_id: string;
  user_name: string | null;
  content: string;
  is_flagged: boolean;
  created_at: string;
}

interface ThreadData {
  thread: {
    id: string;
    course_id: string;
    title: string;
    created_at: string;
    created_by_name: string | null;
  };
  posts: Post[];
}

export default function ThreadView() {
  const { threadId } = useParams();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [feedback, setFeedback] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: async () => {
      const response = await api.get<ThreadData>(`/threads/${threadId}`);
      return response.data;
    },
    enabled: !!threadId,
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/threads/${threadId}/posts`, { content: reply });
    },
    onSuccess: () => {
      setReply("");
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    },
    onError: () => {
      setFeedback("Could not post your reply. Please try again.");
    },
  });

  const flagMutation = useMutation({
    mutationFn: async (postId: string) => {
      await api.put(`/posts/${postId}/flag`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading discussion...</p>;

  if (error) {
    const status = (error as any)?.response?.status;
    if (status === 403) {
      return (
        <p className="text-danger text-sm">
          You must be enrolled in this course to view this discussion.
        </p>
      );
    }
    if (status === 404) {
      return <p className="text-danger text-sm">This discussion no longer exists.</p>;
    }
    return <p className="text-danger text-sm">Failed to load discussion.</p>;
  }

  const { thread, posts } = data!;

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        to={`/discussions/${thread.course_id}`}
        className="text-sm text-link hover:underline"
      >
        ← Back to Discussion
      </Link>

      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mt-2 mb-1">
        {thread.title}
      </h1>
      <p className="text-xs text-gray-400 mb-4">
        {thread.created_by_name ? `Started by ${thread.created_by_name} · ` : ""}
        {new Date(thread.created_at).toLocaleDateString()}
      </p>

      <div className="flex flex-col gap-3 mb-6">
        {posts.map((post) => (
          <div
            key={post.id}
            className="bg-white border border-gray-100 rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-900">
                {post.user_name ?? "Unknown user"}
              </p>
              {post.is_flagged ? (
                <span className="text-xs text-gray-400 shrink-0">🚩 Flagged</span>
              ) : (
                <button
                  type="button"
                  onClick={() => flagMutation.mutate(post.id)}
                  disabled={flagMutation.isPending}
                  className="text-xs text-gray-400 hover:text-danger shrink-0"
                >
                  Report
                </button>
              )}
            </div>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap wrap-break-word">
              {post.content}
            </p>
            <p className="text-[11px] text-gray-400 mt-2">
              {new Date(post.created_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl shadow-md bg-white p-4">
        <p className="font-medium text-gray-900 mb-2">Reply</p>
        <textarea
          placeholder="Write a reply..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm mb-2"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => replyMutation.mutate()}
            disabled={reply.trim() === "" || replyMutation.isPending}
            className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {replyMutation.isPending ? "Posting..." : "Post Reply"}
          </button>
          {feedback && <p className="text-sm text-danger">{feedback}</p>}
        </div>
      </div>
    </div>
  );
}