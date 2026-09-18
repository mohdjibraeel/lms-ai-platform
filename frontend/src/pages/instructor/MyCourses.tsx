import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface Course {
  id: string;
  title: string;
  description: string;
  category: string | null;
  difficulty: string | null;
  status: string;
  created_at: string;
}

export default function MyCourses() {
  const { data, isLoading, error } = useQuery<{ courses: Course[] }>({
    queryKey: ["my-courses"],
    queryFn: async () => {
      const response = await api.get("/courses/mine");
      return response.data;
    },
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading your courses...</p>;
  }

  if (error) {
    return <p className="text-danger text-sm">Couldn't load your courses.</p>;
  }

  const courses = data?.courses ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">My Courses</h1>
        <Link
          to="/instructor/courses/new"
          className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white"
        >
          + Create Course
        </Link>
      </div>

      {courses.length === 0 ? (
        <p className="text-muted text-sm">
          You haven't created any courses yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li
              key={course.id}
              className="rounded-2xl shadow-md bg-white p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-gray-900">{course.title}</p>
                <p className="text-sm text-muted capitalize">{course.status}</p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/instructor/courses/${course.id}/manage`}
                  className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700"
                >
                  Manage
                </Link>
                <Link
                  to={`/instructor/courses/${course.id}/analytics`}
                  className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white"
                >
                  View Analytics
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
