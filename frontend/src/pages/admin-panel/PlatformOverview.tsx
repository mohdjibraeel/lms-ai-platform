import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface OverviewData {
  active_learners_today: number;
  total_enrollments: number;
  completion_rate_percent: number;
}

export default function PlatformOverview() {
  const { data, isLoading, error } = useQuery<OverviewData>({
    queryKey: ["platform-overview"],
    queryFn: async () => {
      const response = await api.get("/admin/analytics/overview");
      return response.data;
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading...</p>;
  if (error || !data) {
    return <p className="text-danger text-sm">Couldn't load platform overview.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">
        Platform Overview
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl shadow-md bg-white p-5">
          <p className="text-sm text-muted">Active Learners Today</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {data.active_learners_today}
          </p>
          <p className="text-xs text-muted mt-1">
            Students who watched a lecture today
          </p>
        </div>

        <div className="rounded-2xl shadow-md bg-white p-5">
          <p className="text-sm text-muted">Total Enrollments</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {data.total_enrollments}
          </p>
        </div>

        <div className="rounded-2xl shadow-md bg-white p-5">
          <p className="text-sm text-muted">Completion Rate</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">
            {data.completion_rate_percent}%
          </p>
          <p className="text-xs text-muted mt-1">
            Of all enrollments, platform-wide
          </p>
        </div>
      </div>
    </div>
  );
}