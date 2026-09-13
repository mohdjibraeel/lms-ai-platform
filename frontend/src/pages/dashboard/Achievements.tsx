import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface Streak {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
}

interface Badge {
  id: number;
  name: string;
  description: string;
  icon_url: string | null;
  earned_at: string;
}

interface Certificate {
  id: string;
  course_id: string;
  course_title: string;
  issued_at: string;
}

interface AchievementsData {
  streak: Streak;
  badges: Badge[];
  certificates: Certificate[];
}

export default function Achievements() {
  const { data, isLoading, error } = useQuery<AchievementsData>({
    queryKey: ["my-achievements"],
    queryFn: async () => {
      const response = await api.get("/me/achievements");
      return response.data;
    },
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading achievements...</p>;
  }

  if (error || !data) {
    return <p className="text-danger text-sm">Couldn't load achievements.</p>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="rounded-2xl shadow-md bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Streak</h2>
        <p className="text-lg text-gray-900">
          {data.streak.current_streak} day
          {data.streak.current_streak === 1 ? "" : "s"} current
        </p>
        <p className="text-sm text-muted">
          Longest streak: {data.streak.longest_streak} day
          {data.streak.longest_streak === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-2xl shadow-md bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Badges</h2>
        {data.badges.length === 0 ? (
          <p className="text-sm text-muted">
            No badges yet — keep learning to earn your first one.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.badges.map((badge) => (
              <li key={badge.id} className="text-sm">
                <span className="font-medium text-gray-900">{badge.name}</span>
                <span className="text-muted"> — {badge.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl shadow-md bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Certificates</h2>
        {data.certificates.length === 0 ? (
          <p className="text-sm text-muted">
            Complete a course to earn your first certificate.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.certificates.map((cert) => (
              <li key={cert.id} className="text-sm">
                <span className="font-medium text-gray-900">
                  {cert.course_title}
                </span>
                <span className="text-muted">
                  {" "}
                  — issued {new Date(cert.issued_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}