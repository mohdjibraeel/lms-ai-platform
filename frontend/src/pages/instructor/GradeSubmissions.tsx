import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface Submission {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  download_url: string;
  submitted_at: string;
  grade: string | null;
  feedback: string | null;
}

interface AssignmentInfo {
  id: string;
  title: string;
  due_date: string | null;
  is_past_due: boolean;
}

export default function GradeSubmissions() {
  const { assignmentId } = useParams();
  const queryClient = useQueryClient();

  // Draft grade/feedback per submission, keyed by submission id — lets each
  // row have its own in-progress edit without touching the others.
  const [drafts, setDrafts] = useState<
    Record<string, { grade: string; feedback: string }>
  >({});

  // Which submissions currently have their grading form open. A graded
  // submission starts closed (showing the read-only summary instead); an
  // ungraded one starts open by default so there's no extra click needed.
  const [editingIds, setEditingIds] = useState<Record<string, boolean>>({});

  function isEditing(sub: Submission) {
    if (sub.id in editingIds) return editingIds[sub.id];
    return sub.grade === null; // default: open if never graded, closed if already graded
  }

  const { data: assignmentData } = useQuery<{ assignment: AssignmentInfo }>({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const response = await api.get(`/assignments/${assignmentId}`);
      return response.data;
    },
    enabled: !!assignmentId,
  });

  const { data, isLoading, error } = useQuery<{ submissions: Submission[] }>({
    queryKey: ["submissions", assignmentId],
    queryFn: async () => {
      const response = await api.get(
        `/assignments/${assignmentId}/submissions`,
      );
      return response.data;
    },
    enabled: !!assignmentId,
  });

  const gradeMutation = useMutation({
    mutationFn: async ({
      submissionId,
      grade,
      feedback,
    }: {
      submissionId: string;
      grade: string;
      feedback: string;
    }) => {
      await api.put(`/submissions/${submissionId}/grade`, {
        grade: Number(grade),
        feedback,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["submissions", assignmentId],
      });
      setEditingIds((prev) => ({ ...prev, [variables.submissionId]: false }));
    },
  });

  function getDraft(sub: Submission) {
    return (
      drafts[sub.id] ?? {
        grade: sub.grade ?? "",
        feedback: sub.feedback ?? "",
      }
    );
  }

  function updateDraft(
    subId: string,
    field: "grade" | "feedback",
    value: string,
  ) {
    setDrafts((prev) => ({
      ...prev,
      [subId]: {
        ...(prev[subId] ?? { grade: "", feedback: "" }),
        [field]: value,
      },
    }));
  }

  if (isLoading)
    return <p className="text-muted text-sm">Loading submissions...</p>;
  if (error)
    return <p className="text-danger text-sm">Couldn't load submissions.</p>;

  const submissions = data?.submissions ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900">
        Submissions
        {assignmentData ? `: ${assignmentData.assignment.title}` : ""}
      </h1>
      {assignmentData?.assignment.due_date && (
        <p
          className={`text-sm mb-4 ${
            assignmentData.assignment.is_past_due ? "text-danger" : "text-muted"
          }`}
        >
          Due: {new Date(assignmentData.assignment.due_date).toLocaleString()}
          {assignmentData.assignment.is_past_due && " — deadline has passed"}
        </p>
      )}
      {!assignmentData?.assignment.due_date && <div className="mb-4" />}

      {submissions.length === 0 ? (
        <p className="text-muted text-sm">No submissions yet.</p>
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => {
            const draft = getDraft(sub);
            return (
              <div key={sub.id} className="rounded-2xl shadow-md bg-white p-4">
                <p className="font-medium text-gray-900">{sub.full_name}</p>
                <p className="text-sm text-muted">{sub.email}</p>
                <p className="text-sm text-muted">
                  Submitted {new Date(sub.submitted_at).toLocaleString()}
                </p>
                <a
                  href={sub.download_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-link text-sm underline"
                >
                  Open submitted file
                </a>

                {isEditing(sub) ? (
                  <div className="mt-3 flex gap-2 items-start">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Grade"
                      value={draft.grade}
                      onChange={(e) =>
                        updateDraft(sub.id, "grade", e.target.value)
                      }
                      className="w-20 rounded-lg border border-gray-200 p-2 text-sm"
                    />
                    <textarea
                      placeholder="Feedback"
                      value={draft.feedback}
                      onChange={(e) =>
                        updateDraft(sub.id, "feedback", e.target.value)
                      }
                      className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        gradeMutation.mutate({
                          submissionId: sub.id,
                          grade: draft.grade,
                          feedback: draft.feedback,
                        })
                      }
                      disabled={gradeMutation.isPending || draft.grade === ""}
                      className="rounded-full bg-accent-green px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {gradeMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    {sub.grade !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingIds((prev) => ({
                            ...prev,
                            [sub.id]: false,
                          }))
                        }
                        className="rounded-full bg-white shadow-md px-4 py-2 text-sm font-medium text-gray-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-gray-50 p-3">
                    <p className="text-sm text-gray-900">
                      Grade: <span className="font-semibold">{sub.grade}</span>
                    </p>
                    {sub.feedback && (
                      <p className="text-sm text-muted mt-1">
                        Feedback: {sub.feedback}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setEditingIds((prev) => ({ ...prev, [sub.id]: true }))
                      }
                      className="mt-2 rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700"
                    >
                      Regrade
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
