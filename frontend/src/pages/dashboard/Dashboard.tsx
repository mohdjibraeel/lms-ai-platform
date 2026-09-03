import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

  const { data, isLoading, error } = useQuery<EnrollmentsResponse>({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      const response = await api.get("/enrollments/me");
      return response.data;
    },
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading your courses...</p>;
  }

  if (error) {
    return <p className="text-danger text-sm">Failed to load your dashboard.</p>;
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
          <Link
            key={enrollment.enrollment_id}
            to="/courses"
            className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 block"
          >
            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-1 text-lg">
                {enrollment.title}
              </h2>
              <p className="text-sm text-muted mb-3">{enrollment.description}</p>

              <div className="mb-2">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Progress</span>
                  <span>{Number(enrollment.progress_percent)}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${Number(enrollment.progress_percent)}%` }}
                  />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}