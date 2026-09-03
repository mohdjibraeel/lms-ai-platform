import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";
import { Link } from "react-router-dom";

interface Course {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  price: string;
  status: string;
}

interface CoursesResponse {
  courses: Course[];
  pagination: {
    page: number;
    totalPages: number;
    totalCount: number;
  };
}

const difficultyStyles: Record<string, string> = {
  beginner: "bg-emerald-100 text-emerald-700",
  intermediate: "bg-amber-100 text-amber-700",
  advanced: "bg-rose-100 text-rose-700",
};

const headerGradients: Record<string, string> = {
  beginner: "from-emerald-400 to-emerald-500",
  intermediate: "from-amber-400 to-amber-500",
  advanced: "from-rose-400 to-rose-500",
};

export default function CourseCatalog() {
  const { data, isLoading, error } = useQuery<CoursesResponse>({
    queryKey: ["courses"],
    queryFn: async () => {
      const response = await api.get("/courses");
      return response.data;
    },
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading courses...</p>;
  }

  if (error) {
    return <p className="text-danger text-sm">Failed to load courses.</p>;
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
        Course Catalog
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.courses.map((course) => (
          <Link
            key={course.id}
            to={`/courses/${course.id}`}
            className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-200 block"
          >
            <div
              className={`h-20 bg-linear-to-br ${headerGradients[course.difficulty] ?? "from-gray-400 to-gray-500"} flex items-end p-4`}
            >
              <span className="text-white/90 text-xs font-medium uppercase tracking-wide">
                {course.category}
              </span>
            </div>

            <div className="p-4">
              <h2 className="font-semibold text-gray-900 mb-1 text-lg">
                {course.title}
              </h2>
              <p className="text-sm text-muted mb-3">{course.description}</p>

              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-1 ${difficultyStyles[course.difficulty] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {course.difficulty}
                </span>
                <p className="text-base font-bold text-gray-900">
                  {Number(course.price) === 0 ? "Free" : `$${course.price}`}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {data?.courses.length === 0 && (
        <p className="text-muted text-sm">No courses found.</p>
      )}
    </div>
  );
}
