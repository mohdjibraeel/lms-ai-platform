import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";

interface ReviewOption {
  id: string;
  option_text: string;
  is_correct: boolean;
}

interface ReviewQuestion {
  id: string;
  question_text: string;
  question_type: string;
  order_index: number;
  options: ReviewOption[];
}

interface ReviewQuiz {
  id: string;
  title: string;
  is_published: boolean;
  is_ai_generated: boolean;
  questions: ReviewQuestion[];
}

export default function QuizReview() {
  const { quizId } = useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<{ quiz: ReviewQuiz }>({
    queryKey: ["quiz-review", quizId],
    queryFn: async () => {
      const response = await api.get(`/quizzes/${quizId}/review`);
      return response.data;
    },
    enabled: !!quizId,
  });
  const publishMutation = useMutation({
    mutationFn: async (isPublished: boolean) => {
      await api.put(`/quizzes/${quizId}/publish`, {
        is_published: isPublished,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quiz-review", quizId] });
    },
    onError: () => {
      alert("Couldn't change the quiz status. Please try again.");
    },
  });
  if (isLoading) return <p className="text-muted text-sm">Loading quiz...</p>;
  if (error || !data)
    return <p className="text-danger text-sm">Couldn't load this quiz.</p>;

  const quiz = data.quiz;

  return (
    <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{quiz.title}</h1>

      <p className="text-sm mb-4">
        {quiz.is_published ? (
          <span className="text-accent-green font-medium">✓ Published</span>
        ) : (
          <span className="text-danger font-medium">Hidden from students</span>
        )}
      </p>
      <button
        type="button"
        onClick={() => publishMutation.mutate(!quiz.is_published)}
        disabled={publishMutation.isPending}
        className="mb-6 rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {publishMutation.isPending
          ? "Saving..."
          : quiz.is_published
            ? "Hide from students"
            : "Publish to students"}
      </button>

      <div className="space-y-6">
        {quiz.questions.map((question, index) => (
          <div key={question.id} className="border-b border-gray-200 pb-4">
            <p className="font-medium text-gray-900 mb-2">
              {index + 1}. {question.question_text}
            </p>
            <ul className="space-y-1">
              {question.options.map((option) => (
                <li
                  key={option.id}
                  className={
                    option.is_correct
                      ? "text-sm text-accent-green font-medium"
                      : "text-sm text-muted"
                  }
                >
                  {option.is_correct ? "✓ " : "• "}
                  {option.option_text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <Link
        to="/instructor/courses"
        className="mt-6 inline-block text-sm text-link underline"
      >
        ← Back to my courses
      </Link>
    </div>
  );
}
