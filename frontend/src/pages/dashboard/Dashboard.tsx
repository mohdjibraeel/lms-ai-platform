import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import api from "../../services/api";
import { useAuthStore } from "../../store/authStore";

interface Enrollment {
  enrollment_id: string;
  course_id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  price: string;
  progress_percent: string;
}

interface EnrollmentsResponse {
  enrollments: Enrollment[];
}

export default function Dashboard() {
  const role = useAuthStore((state) => state.role);
  const [studyPlans, setStudyPlans] = useState<
    Record<
      string,
      {
        overall_summary: string;
        focus_areas: { topic: string; why: string; suggested_action: string }[];
      }
    >
  >({});

  const { data, isLoading, error } = useQuery<EnrollmentsResponse>({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      const response = await api.get("/enrollments/me");
      return response.data;
    },
  });

  const studyPlanMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const response = await api.post<{
        plan: {
          overall_summary: string;
          focus_areas: {
            topic: string;
            why: string;
            suggested_action: string;
          }[];
        };
      }>("/ai/study-plan", { course_id: courseId });
      return { courseId, plan: response.data.plan };
    },
    onSuccess: ({ courseId, plan }) => {
      setStudyPlans((prev) => ({ ...prev, [courseId]: plan }));
    },
    onError: (err: any) => {
      const code = err.response?.data?.error?.code;
      if (code === "NO_QUIZ_HISTORY") {
        alert(
          "You don't have any graded quiz attempts in this course yet — take a quiz first.",
        );
      } else if (code === "AI_QUOTA_EXCEEDED") {
        alert("Daily AI usage limit reached. Please try again tomorrow.");
      } else if (code === "AI_ACCESS_DENIED") {
        alert("You don't have access to AI features for this course.");
      } else {
        alert("Couldn't generate a study plan. Please try again.");
      }
    },
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading your courses...</p>;
  }

  if (error) {
    return (
      <p className="text-danger text-sm">Failed to load your dashboard.</p>
    );
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
        {role === "student" ? "My Courses" : "Dashboard"}
      </h1>

      {data && data.enrollments.length === 0 && (
        <p className="text-muted text-sm">
          You're not enrolled in any courses yet.{" "}
          <Link to="/courses" className="text-link underline">
            Browse the catalog
          </Link>
          .
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.enrollments.map((enrollment) => (
          <div
            key={enrollment.enrollment_id}
            className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
          >
            <Link to={`/courses/${enrollment.course_id}`} className="block">
              <div className="p-4">
                <h2 className="font-semibold text-gray-900 mb-1 text-lg">
                  {enrollment.title}
                </h2>
                <p className="text-sm text-muted mb-3">
                  {enrollment.description}
                </p>

                <div className="mb-2">
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Progress</span>
                    <span>{Number(enrollment.progress_percent)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full"
                      style={{
                        width: `${Number(enrollment.progress_percent)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Link>

            <div className="px-4 pb-4 -mt-2">
              <button
                type="button"
                onClick={() => studyPlanMutation.mutate(enrollment.course_id)}
                disabled={
                  studyPlanMutation.isPending &&
                  studyPlanMutation.variables === enrollment.course_id
                }
                className="text-xs text-link underline disabled:opacity-50"
              >
                {studyPlanMutation.isPending &&
                studyPlanMutation.variables === enrollment.course_id
                  ? "Generating..."
                  : studyPlans[enrollment.course_id]
                    ? "Regenerate Study Plan"
                    : "✨ Get My Study Plan"}
              </button>

              {studyPlans[enrollment.course_id] && (
                <div className="mt-2 rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-700 mb-2">
                    {studyPlans[enrollment.course_id].overall_summary}
                  </p>
                  {studyPlans[enrollment.course_id].focus_areas.length > 0 && (
                    <ul className="text-xs text-muted space-y-1">
                      {studyPlans[enrollment.course_id].focus_areas.map(
                        (area, i) => (
                          <li key={i}>
                            <span className="font-medium text-gray-700">
                              {area.topic}:
                            </span>{" "}
                            {area.why} — {area.suggested_action}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
