import { useEffect, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import api from "../../services/api";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
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
const inputClass =
  "border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-shadow";
const pageButtonClass =
  "border border-gray-200 rounded-lg px-4 py-2 text-sm bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors";
export default function CourseCatalog() {
  // What the user has typed / picked right now
  const [searchText, setSearchText] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  // The search text we actually send to the backend: it only updates 0.4s
  // after the user stops typing, so we don't fire a request per letter.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);
  // The list of categories for the dropdown
  const { data: categoriesData } = useQuery<{ categories: string[] }>({
    queryKey: ["course-categories"],
    queryFn: async () => {
      const response = await api.get("/courses/categories");
      return response.data;
    },
  });
  // The courses. Changing any filter changes the query key, so React Query
  // fetches again. keepPreviousData keeps the old cards on screen meanwhile.
  const { data, isLoading, isFetching, error } = useQuery<CoursesResponse>({
    queryKey: ["courses", debouncedSearch, category, difficulty, page],
    queryFn: async () => {
      const response = await api.get("/courses", {
        params: {
          q: debouncedSearch || undefined,
          category: category || undefined,
          difficulty: difficulty || undefined,
          page,
        },
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
  const hasFilters = searchText !== "" || category !== "" || difficulty !== "";
  const clearFilters = () => {
    setSearchText("");
    setDebouncedSearch("");
    setCategory("");
    setDifficulty("");
    setPage(1);
  };
  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-6">
        Course Catalog
      </h1>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            aria-label="Search courses"
            placeholder="Search courses..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={`${inputClass} w-full pl-9`}
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All categories</option>
          {categoriesData?.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by difficulty"
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All levels</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-gray-600 underline px-2"
          >
            Clear
          </button>
        )}
      </div>
      {isLoading && <p className="text-muted text-sm">Loading courses...</p>}
      {error && <p className="text-danger text-sm">Failed to load courses.</p>}
      {data && (
        <p className="text-sm text-muted mb-4" aria-live="polite">
          {data.pagination.totalCount}{" "}
          {data.pagination.totalCount === 1 ? "course" : "courses"} found
        </p>
      )}
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 transition-opacity ${isFetching ? "opacity-60" : ""}`}
      >
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
      {data && data.courses.length === 0 && (
        <p className="text-muted text-sm">No courses found.</p>
      )}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page <= 1}
            className={pageButtonClass}
          >
            Previous
          </button>
          <span className="text-sm text-muted" aria-live="polite">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pagination.totalPages}
            className={pageButtonClass}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}