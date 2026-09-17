import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface Lecture {
  id: string;
  title: string;
  order_index: number;
  video_url: string | null;
}

interface Quiz {
  id: string;
  title: string;
}

interface Module {
  id: string;
  title: string;
  order_index: number;
  lectures: Lecture[];
  quizzes: Quiz[];
}

interface Assignment {
  id: string;
  title: string;
  due_date: string | null;
}

interface CourseData {
  id: string;
  title: string;
  description: string;
  category: string | null;
  difficulty: string | null;
  price: string;
  status: string;
  modules: Module[];
  assignments: Assignment[];
}

export default function ManageCourse() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [lectureForms, setLectureForms] = useState<
    Record<string, { title: string; file: File | null }>
  >({});
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    category: "",
    difficulty: "",
    price: "",
  });

  const { data, isLoading, error } = useQuery<{ course: CourseData }>({
    queryKey: ["course-detail", courseId],
    queryFn: async () => {
      const response = await api.get(`/courses/${courseId}`);
      return response.data;
    },
    enabled: !!courseId,
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      await api.put(`/courses/${courseId}`, {
        title: editForm.title,
        description: editForm.description,
        category: editForm.category || null,
        difficulty: editForm.difficulty || null,
        price: Number(editForm.price) || 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-detail", courseId] });
      setIsEditing(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/courses/${courseId}`);
    },
    onSuccess: () => {
      navigate("/instructor/courses");
    },
  });

  function startEditing() {
    if (!data) return;
    setEditForm({
      title: data.course.title,
      description: data.course.description ?? "",
      category: data.course.category ?? "",
      difficulty: data.course.difficulty ?? "",
      price: data.course.price,
    });
    setIsEditing(true);
  }

  const addModuleMutation = useMutation({
    mutationFn: async () => {
      const modules = data?.course.modules ?? [];
      const nextOrder = modules.length + 1;
      await api.post(`/courses/${courseId}/modules`, {
        title: newModuleTitle,
        order_index: nextOrder,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["course-detail", courseId] });
      setNewModuleTitle("");
    },
  });

  const addLectureMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      const form = lectureForms[moduleId];
      const modules = data?.course.modules ?? [];
      const currentModule = modules.find((m) => m.id === moduleId);
      const nextOrder = (currentModule?.lectures.length ?? 0) + 1;

      const formData = new FormData();
      formData.append("title", form.title);
      formData.append("order_index", String(nextOrder));
      if (form.file) formData.append("video", form.file);

      await api.post(`/courses/modules/${moduleId}/lectures`, formData);
    },
    onSuccess: (_data, moduleId) => {
      queryClient.invalidateQueries({ queryKey: ["course-detail", courseId] });
      setLectureForms((prev) => ({
        ...prev,
        [moduleId]: { title: "", file: null },
      }));
    },
  });

  function getLectureForm(moduleId: string) {
    return lectureForms[moduleId] ?? { title: "", file: null };
  }

  function updateLectureForm(
    moduleId: string,
    patch: Partial<{ title: string; file: File | null }>,
  ) {
    setLectureForms((prev) => ({
      ...prev,
      [moduleId]: { ...getLectureForm(moduleId), ...patch },
    }));
  }

  if (isLoading) return <p className="text-muted text-sm">Loading course...</p>;
  if (error || !data)
    return <p className="text-danger text-sm">Couldn't load course.</p>;

  const course = data.course;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-semibold text-gray-900">
          Manage: {course.title}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700"
          >
            Edit
          </button>
          <Link
            to={`/instructor/courses/${courseId}/assignments/new`}
            className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700"
          >
            + Create Assignment
          </Link>
          {course.status !== "archived" && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "Archive this course? Students already enrolled will keep access, but no one new can enroll.",
                  )
                ) {
                  archiveMutation.mutate();
                }
              }}
              disabled={archiveMutation.isPending}
              className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-danger disabled:opacity-50"
            >
              Archive
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted mb-4 capitalize">
        Status: {course.status}
      </p>

      {isEditing && (
        <div className="rounded-2xl shadow-md bg-white p-4 mb-4 space-y-2">
          <input
            type="text"
            placeholder="Title"
            value={editForm.title}
            onChange={(e) =>
              setEditForm((prev) => ({ ...prev, title: e.target.value }))
            }
            className="w-full rounded-lg border border-gray-200 p-2 text-sm"
          />
          <textarea
            placeholder="Description"
            value={editForm.description}
            onChange={(e) =>
              setEditForm((prev) => ({ ...prev, description: e.target.value }))
            }
            className="w-full rounded-lg border border-gray-200 p-2 text-sm"
            rows={3}
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Category"
              value={editForm.category}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, category: e.target.value }))
              }
              className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
            />
            <input
              type="text"
              placeholder="Difficulty"
              value={editForm.difficulty}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, difficulty: e.target.value }))
              }
              className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
            />
            <input
              type="number"
              placeholder="Price"
              value={editForm.price}
              onChange={(e) =>
                setEditForm((prev) => ({ ...prev, price: e.target.value }))
              }
              className="w-24 rounded-lg border border-gray-200 p-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => editMutation.mutate()}
              disabled={editForm.title.trim() === "" || editMutation.isPending}
              className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {course.modules.map((module) => {
          const lectureForm = getLectureForm(module.id);
          return (
            <div key={module.id} className="rounded-2xl shadow-md bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">{module.title}</p>
                <Link
                  to={`/instructor/modules/${module.id}/quizzes/new`}
                  className="text-sm text-link underline"
                >
                  + Create Quiz
                </Link>
              </div>

              {module.quizzes.length > 0 && (
                <ul className="text-sm text-muted mb-2 space-y-1">
                  {module.quizzes.map((quiz) => (
                    <li key={quiz.id}>📝 {quiz.title}</li>
                  ))}
                </ul>
              )}

              {module.lectures.length > 0 && (
                <ul className="text-sm text-muted mb-3 space-y-1">
                  {module.lectures.map((lec) => (
                    <li key={lec.id}>
                      {lec.title} {lec.video_url ? "🎬" : "(no video)"}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="New lecture title"
                  value={lectureForm.title}
                  onChange={(e) =>
                    updateLectureForm(module.id, { title: e.target.value })
                  }
                  className="rounded-lg border border-gray-200 p-2 text-sm flex-1"
                />
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) =>
                    updateLectureForm(module.id, {
                      file: e.target.files?.[0] ?? null,
                    })
                  }
                  className="text-sm"
                />
                <button
                  type="button"
                  onClick={() => addLectureMutation.mutate(module.id)}
                  disabled={
                    lectureForm.title.trim() === "" ||
                    addLectureMutation.isPending
                  }
                  className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Add Lecture
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {course.assignments.length > 0 && (
        <div className="mt-6 rounded-2xl shadow-md bg-white p-4">
          <p className="font-medium text-gray-900 mb-2">Assignments</p>
          <ul className="text-sm text-muted space-y-1">
            {course.assignments.map((a) => (
              <li key={a.id}>
                📄 {a.title}
                {a.due_date &&
                  ` — due ${new Date(a.due_date).toLocaleDateString()}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-2xl shadow-md bg-white p-4">
        <p className="font-medium text-gray-900 mb-2">Add a Module</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Module title"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
          />
          <button
            type="button"
            onClick={() => addModuleMutation.mutate()}
            disabled={
              newModuleTitle.trim() === "" || addModuleMutation.isPending
            }
            className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Add Module
          </button>
        </div>
      </div>
    </div>
  );
}
