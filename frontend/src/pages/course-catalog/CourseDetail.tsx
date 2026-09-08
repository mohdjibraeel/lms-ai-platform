import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";
import { useAuthStore } from "../../store/authStore";

interface Lecture {
  id: string;
  title: string;
  video_url: string | null;
}

interface Module {
  id: string;
  title: string;
  order_index: number;
  lectures: Lecture[];
}

interface CourseDetailResponse {
  course: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
    price: string;
    modules: Module[];
  };
}

export default function CourseDetail() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.token);
  const role = useAuthStore((state) => state.role);
  const [enrollMessage, setEnrollMessage] = useState("");

  const { data, isLoading, error } = useQuery<CourseDetailResponse>({
    queryKey: ["course", courseId],
    queryFn: async () => {
      const response = await api.get(`/courses/${courseId}`);
      return response.data;
    },
    enabled: !!courseId,
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/courses/${courseId}/enroll`);
      return response.data;
    },
    onSuccess: () => {
      setEnrollMessage("You're enrolled! Check your Dashboard.");
      queryClient.invalidateQueries({ queryKey: ["my-enrollments"] });
    },
    onError: (err: any) => {
      if (err.response?.data?.error?.code === "ALREADY_ENROLLED") {
        setEnrollMessage("You're already enrolled in this course.");
      } else {
        setEnrollMessage("Could not enroll. Please try again.");
      }
    },
  });

  const handleEnrollClick = () => {
    if (!token) {
      navigate("/login");
      return;
    }
    enrollMutation.mutate();
  };

  if (isLoading) return <p className="text-muted text-sm">Loading course...</p>;
  if (error) return <p className="text-danger text-sm">Failed to load course.</p>;

  const course = data!.course;

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
        {course.title}
      </h1>
      <p className="text-muted mb-4">{course.description}</p>

      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2.5 py-1">
          {course.category}
        </span>
        <span className="text-xs font-medium bg-gray-100 text-gray-600 rounded-full px-2.5 py-1">
          {course.difficulty}
        </span>
        <span className="font-bold text-gray-900 ml-auto">
          {Number(course.price) === 0 ? "Free" : `$${course.price}`}
        </span>
      </div>

      {role !== "instructor" && role !== "admin" && (
        <div className="mb-6">
          <button
            onClick={handleEnrollClick}
            disabled={enrollMutation.isPending}
            className="bg-black text-white rounded-full px-6 py-2 text-sm font-medium hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {enrollMutation.isPending ? "Enrolling..." : "Enroll"}
          </button>
          {enrollMessage && (
            <p className="text-sm text-muted mt-2">{enrollMessage}</p>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Course Content</h2>
      <div className="flex flex-col gap-3">
        {course.modules.map((mod) => (
          <div key={mod.id} className="bg-white border border-gray-100 rounded-xl p-4">
            <h3 className="font-medium text-gray-900 mb-2">{mod.title}</h3>
            <ul className="flex flex-col gap-1">
              {mod.lectures.map((lec) => (
                <li key={lec.id} className="text-sm text-muted">
                  {lec.video_url ? (
                    <Link
                      to={`/lectures/${lec.id}/player`}
                      className="text-link hover:underline"
                    >
                      ▶ {lec.title}
                    </Link>
                  ) : (
                    <span>{lec.title}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}