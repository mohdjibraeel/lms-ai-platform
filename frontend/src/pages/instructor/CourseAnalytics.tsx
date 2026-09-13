import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface LectureStat {
  lecture_id: string;
  title: string;
  completion_rate_percent: number;
  drop_off_from_previous_percent: number | null;
  avg_watched_seconds: number;
}

interface QuizStat {
  quiz_id: string;
  title: string;
  attempts_count: number;
  avg_score: number | null;
}

interface AnalyticsData {
  course_id: string;
  total_enrolled: number;
  lectures: LectureStat[];
  quizzes: QuizStat[];
}

export default function CourseAnalytics() {
  const { courseId } = useParams();

  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["course-analytics", courseId],
    queryFn: async () => {
      const response = await api.get(`/courses/${courseId}/analytics`);
      return response.data;
    },
    enabled: !!courseId,
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading analytics...</p>;
  }

  if (error || !data) {
    return (
      <p className="text-danger text-sm">
        Couldn't load analytics — you may not own this course.
      </p>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-muted">
          {data.total_enrolled} student{data.total_enrolled === 1 ? "" : "s"}{" "}
          enrolled
        </p>
      </div>

      <div className="rounded-2xl shadow-md bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-3">
          Lecture Completion
        </h2>
        {data.lectures.length === 0 ? (
          <p className="text-sm text-muted">No lectures yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.lectures.map((lec) => (
              <li key={lec.lecture_id} className="text-sm">
                <p className="font-medium text-gray-900">{lec.title}</p>
                <p className="text-muted">
                  {lec.completion_rate_percent}% completed
                  {lec.drop_off_from_previous_percent !== null &&
                    ` — ${lec.drop_off_from_previous_percent}% drop-off from previous`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl shadow-md bg-white p-6">
        <h2 className="font-semibold text-gray-900 mb-3">Quiz Performance</h2>
        {data.quizzes.length === 0 ? (
          <p className="text-sm text-muted">No quizzes yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.quizzes.map((quiz) => (
              <li key={quiz.quiz_id} className="text-sm">
                <p className="font-medium text-gray-900">{quiz.title}</p>
                <p className="text-muted">
                  {quiz.attempts_count} attempt
                  {quiz.attempts_count === 1 ? "" : "s"}
                  {quiz.avg_score !== null
                    ? ` — avg. score ${quiz.avg_score}%`
                    : " — not yet graded"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}