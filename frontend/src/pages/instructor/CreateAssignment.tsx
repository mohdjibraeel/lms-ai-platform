import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

export default function CreateAssignment() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post("/assignments", {
        course_id: courseId,
        title,
        instructions,
        due_date: dueDate || null,
      });
    },
    onSuccess: () => {
      navigate(`/instructor/courses/${courseId}/manage`);
    },
  });

  return (
    <div className="max-w-xl mx-auto rounded-2xl shadow-md bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">
        Create Assignment
      </h1>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Assignment title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
        />
        <textarea
          placeholder="Instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
          rows={4}
        />
        <div>
          <label className="text-sm text-muted block mb-1">
            Due date (optional)
          </label>
          <input
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-gray-200 p-2 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => createMutation.mutate()}
        disabled={title.trim() === "" || instructions.trim() === "" || createMutation.isPending}
        className="mt-4 rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {createMutation.isPending ? "Creating..." : "Create Assignment"}
      </button>
      {createMutation.isError && (
        <p className="text-danger text-sm mt-2">
          Couldn't create assignment — please try again.
        </p>
      )}
    </div>
  );
}