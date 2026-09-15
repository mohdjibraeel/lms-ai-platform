import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";

interface PendingCourse {
  id: string;
  title: string;
  description: string;
  category: string | null;
  difficulty: string | null;
  created_at: string;
  instructor_name: string;
  instructor_email: string;
}

export default function CourseApprovals() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ courses: PendingCourse[] }>({
    queryKey: ["pending-courses"],
    queryFn: async () => {
      const response = await api.get("/admin/courses/pending");
      return response.data;
    },
  });

  const decisionMutation = useMutation({
    mutationFn: async ({
      courseId,
      decision,
    }: {
      courseId: string;
      decision: "approve" | "reject";
    }) => {
      await api.put(`/admin/courses/${courseId}/${decision}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-courses"] });
    },
  });

  if (isLoading) return <p className="text-muted text-sm">Loading...</p>;
  if (error) return <p className="text-danger text-sm">Couldn't load pending courses.</p>;

  const courses = data?.courses ?? [];

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">
        Course Approvals
      </h1>

      {courses.length === 0 ? (
        <p className="text-muted text-sm">No courses waiting for review.</p>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <div key={course.id} className="rounded-2xl shadow-md bg-white p-4">
              <p className="font-medium text-gray-900">{course.title}</p>
              <p className="text-sm text-gray-700 mb-1">{course.description}</p>
              <p className="text-sm text-muted">
                By {course.instructor_name} ({course.instructor_email})
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    decisionMutation.mutate({ courseId: course.id, decision: "approve" })
                  }
                  disabled={decisionMutation.isPending}
                  className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() =>
                    decisionMutation.mutate({ courseId: course.id, decision: "reject" })
                  }
                  disabled={decisionMutation.isPending}
                  className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-danger"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}