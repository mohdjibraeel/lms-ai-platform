import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface AssignmentData {
  id: string;
  course_id: string;
  title: string;
  instructions: string;
  rubric: { criteria: string[]; max_score: number } | null;
  due_date: string | null;
  is_past_due: boolean;
}

interface Submission {
  id: string;
  assignment_id: string;
  user_id: string;
  file_url: string;
  submitted_at: string;
  grade: string | null;
  feedback: string | null;
}

export default function AssignmentSubmission() {
  const { assignmentId } = useParams();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: assignmentData, isLoading: assignmentLoading } = useQuery<{
    assignment: AssignmentData;
  }>({
    queryKey: ["assignment", assignmentId],
    queryFn: async () => {
      const response = await api.get(`/assignments/${assignmentId}`);
      return response.data;
    },
    enabled: !!assignmentId,
  });

  const { data: submissionData, isLoading: submissionLoading } = useQuery<{
    submission: Submission | null;
  }>({
    queryKey: ["my-submission", assignmentId],
    queryFn: async () => {
      const response = await api.get(
        `/assignments/${assignmentId}/my-submission`
      );
      return response.data;
    },
    enabled: !!assignmentId,
  });

  const submitMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post<{ submission: Submission }>(
        `/assignments/${assignmentId}/submit`,
        formData
      );
      return response.data.submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["my-submission", assignmentId],
      });
      setSelectedFile(null);
    },
  });

  if (assignmentLoading || submissionLoading) {
    return <p className="text-muted text-sm">Loading assignment...</p>;
  }

  const assignment = assignmentData?.assignment;
  if (!assignment) return null;

  const submission = submissionData?.submission ?? null;

  return (
    <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">
        {assignment.title}
      </h1>

      <p className="text-sm text-gray-700 mb-3">{assignment.instructions}</p>

      {assignment.due_date && (
        <p
          className={`text-sm mb-1 ${
            assignment.is_past_due ? "text-danger" : "text-muted"
          }`}
        >
          Due: {new Date(assignment.due_date).toLocaleString()}
          {assignment.is_past_due && " — deadline has passed"}
        </p>
      )}

      {assignment.rubric && (
        <div className="text-sm text-muted mb-4">
          <p className="font-medium text-gray-700">Graded on:</p>
          <ul className="list-disc list-inside">
            {assignment.rubric.criteria.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {submission && (
        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            Submitted {new Date(submission.submitted_at).toLocaleString()}
          </p>
          {submission.grade !== null ? (
            <>
              <p className="mt-2 text-lg text-gray-900">
                Grade:{" "}
                <span className="font-semibold">
                  {submission.grade}
                  {assignment.rubric ? ` / ${assignment.rubric.max_score}` : ""}
                </span>
              </p>
              {submission.feedback && (
                <p className="mt-1 text-sm text-gray-700">
                  Feedback: {submission.feedback}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Waiting for grading.</p>
          )}
        </div>
      )}

      {!assignment.is_past_due && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            {submission ? "Resubmit" : "Submit your work"}
          </p>
          <input
            type="file"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="text-sm mb-2 block"
          />
          <button
            type="button"
            onClick={() => selectedFile && submitMutation.mutate(selectedFile)}
            disabled={!selectedFile || submitMutation.isPending}
            className="rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitMutation.isPending ? "Uploading..." : "Submit"}
          </button>
          {submitMutation.isError && (
            <p className="text-danger text-sm mt-2">
              Couldn't submit — please try again.
            </p>
          )}
        </div>
      )}

      {assignment.is_past_due && !submission && (
        <p className="text-danger text-sm mt-4">
          The deadline has passed — submissions are no longer accepted.
        </p>
      )}
    </div>
  );
}