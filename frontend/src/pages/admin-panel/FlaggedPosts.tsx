import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "../../services/api";

interface FlaggedPost {
  id: string;
  content: string;
  created_at: string;
  posted_by_name: string | null;
  posted_by_email: string | null;
  thread_id: string;
  thread_title: string;
  course_id: string;
  course_title: string;
}

export default function FlaggedPosts() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ posts: FlaggedPost[] }>({
    queryKey: ["flagged-posts"],
    queryFn: async () => {
      const response = await api.get("/admin/discussions/flagged");
      return response.data;
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      postId,
      action,
    }: {
      postId: string;
      action: "remove" | "dismiss";
    }) => {
      await api.put(`/admin/discussions/posts/${postId}/${action}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-posts"] });
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading...</p>;
  if (error)
    return <p className="text-danger text-sm">Couldn't load flagged posts.</p>;

  const posts = data?.posts ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">
        🚩 Flagged Posts
      </h1>

      {posts.length === 0 ? (
        <p className="text-muted text-sm">Nothing flagged right now.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="rounded-2xl shadow-md bg-white p-4">
              <p className="text-xs text-muted mb-1">
                <Link
                  to={`/courses/${post.course_id}`}
                  className="hover:underline"
                >
                  {post.course_title}
                </Link>
                {" · "}
                <Link
                  to={`/threads/${post.thread_id}`}
                  className="hover:underline"
                >
                  {post.thread_title}
                </Link>
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap wrap-break-word mb-1">
                {post.content}
              </p>
              <p className="text-sm text-muted">
                By {post.posted_by_name ?? "Unknown user"}
                {post.posted_by_email ? ` (${post.posted_by_email})` : ""}
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    actionMutation.mutate({ postId: post.id, action: "remove" })
                  }
                  disabled={actionMutation.isPending}
                  className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-danger disabled:opacity-50"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() =>
                    actionMutation.mutate({ postId: post.id, action: "dismiss" })
                  }
                  disabled={actionMutation.isPending}
                  className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Dismiss (false alarm)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}