import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface CourseResponse {
  course: { id: string };
}

export default function CreateCourse() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");
  const [price, setPrice] = useState("0");

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<CourseResponse>("/courses", {
        title,
        description,
        category: category || null,
        difficulty,
        price: Number(price) || 0,
      });
      return response.data.course;
    },
    onSuccess: (course) => {
      navigate(`/instructor/courses/${course.id}/manage`);
    },
  });

  return (
    <div className="max-w-xl mx-auto rounded-2xl shadow-md bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">
        Create a Course
      </h1>

      <div className="space-y-3">
        <input
          type="text"
          placeholder="Course title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
        />
        <textarea
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
          rows={3}
        />
        <input
          type="text"
          placeholder="Category (e.g. CS)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
        />
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        <input
          type="number"
          min={0}
          placeholder="Price"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-full rounded-lg border border-gray-200 p-2 text-sm"
        />
      </div>

      <button
        type="button"
        onClick={() => createMutation.mutate()}
        disabled={title.trim() === "" || createMutation.isPending}
        className="mt-4 rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {createMutation.isPending ? "Creating..." : "Create Course"}
      </button>
      {createMutation.isError && (
        <p className="text-danger text-sm mt-2">
          Couldn't create course — please try again.
        </p>
      )}
    </div>
  );
}