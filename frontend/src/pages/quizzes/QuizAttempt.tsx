import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface QuizOption {
  id: string;
  option_text: string;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: "mcq" | "multi_select" | "short_answer";
  order_index: number;
  options: QuizOption[];
}

interface QuizData {
  id: string;
  title: string;
  module_id: string;
  questions: QuizQuestion[];
}

interface AttemptResult {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number | null;
  started_at: string;
  submitted_at: string;
}

// What the student has picked so far, keyed by question_id
type AnswerState = Record<
  string,
  { selected_option_ids?: string[]; text_answer?: string }
>;

export default function QuizAttempt() {
  const { quizId } = useParams();
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [result, setResult] = useState<AttemptResult | null>(null);

  const { data, isLoading, error } = useQuery<{ quiz: QuizData }>({
    queryKey: ["quiz", quizId],
    queryFn: async () => {
      const response = await api.get(`/quizzes/${quizId}`);
      return response.data;
    },
    enabled: !!quizId,
  });

  const startAttemptMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ attempt: { id: string } }>(
        `/quizzes/${quizId}/attempt`,
      );
      return response.data.attempt;
    },
    onSuccess: (attempt) => setAttemptId(attempt.id),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        answers: Object.entries(answers).map(([question_id, value]) => ({
          question_id,
          ...value,
        })),
      };
      const response = await api.post<{ attempt: AttemptResult }>(
        `/attempts/${attemptId}/submit`,
        payload,
      );
      return response.data.attempt;
    },
    onSuccess: (attempt) => setResult(attempt),
  });

  function selectSingleOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { selected_option_ids: [optionId] },
    }));
  }

  function toggleMultiOption(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = prev[questionId]?.selected_option_ids ?? [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: { selected_option_ids: next } };
    });
  }

  function setTextAnswer(questionId: string, text: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: { text_answer: text } }));
  }

  if (isLoading) return <p className="text-muted text-sm">Loading quiz...</p>;

  if (error) {
    return (
      <p className="text-danger text-sm">
        Couldn't load this quiz — you may not be enrolled in this course.
      </p>
    );
  }

  const quiz = data?.quiz;
  if (!quiz) return null;

  // Result screen — shown once the attempt has been submitted
  if (result) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {quiz.title} — Submitted
        </h1>
        {result.score === null ? (
          <p className="text-muted text-sm">
            Not graded yet — this quiz needs manual review.
          </p>
        ) : (
          <p className="text-lg text-gray-900">
            Your score: <span className="font-semibold">{result.score}%</span>
          </p>
        )}
      </div>
    );
  }

  // Pre-attempt screen — quiz details + a Start button
  if (!attemptId) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {quiz.title}
        </h1>
        <p className="text-muted text-sm mb-4">
          {quiz.questions.length} question
          {quiz.questions.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => startAttemptMutation.mutate()}
          disabled={startAttemptMutation.isPending}
          className="rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Start Quiz
        </button>
        {startAttemptMutation.isError && (
          <p className="text-danger text-sm mt-2">
            Couldn't start this quiz. Please try again.
          </p>
        )}
      </div>
    );
  }

  // A question counts as "answered" if it has at least one selected option
  // (mcq/multi_select) or non-empty text (short_answer).
  function isQuestionAnswered(question: QuizQuestion): boolean {
    const answer = answers[question.id];
    if (!answer) return false;
    if (question.question_type === "short_answer") {
      return (answer.text_answer ?? "").trim().length > 0;
    }
    return (answer.selected_option_ids ?? []).length > 0;
  }

  const unansweredCount = quiz.questions.filter(
    (q) => !isQuestionAnswered(q),
  ).length;

  // In-progress screen — the actual question form
  return (
    <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">{quiz.title}</h1>

      <div className="space-y-6">
        {quiz.questions.map((question) => (
          <div key={question.id} className="border-b border-gray-200 pb-4">
            <p className="font-medium text-gray-900 mb-2">
              {question.question_text}
            </p>

            {question.question_type === "mcq" &&
              question.options.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 text-sm mb-1"
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={
                      answers[question.id]?.selected_option_ids?.[0] ===
                      option.id
                    }
                    onChange={() => selectSingleOption(question.id, option.id)}
                  />
                  {option.option_text}
                </label>
              ))}

            {question.question_type === "multi_select" &&
              question.options.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center gap-2 text-sm mb-1"
                >
                  <input
                    type="checkbox"
                    checked={
                      answers[question.id]?.selected_option_ids?.includes(
                        option.id,
                      ) ?? false
                    }
                    onChange={() => toggleMultiOption(question.id, option.id)}
                  />
                  {option.option_text}
                </label>
              ))}

            {question.question_type === "short_answer" && (
              <textarea
                value={answers[question.id]?.text_answer ?? ""}
                onChange={(e) => setTextAnswer(question.id, e.target.value)}
                className="w-full rounded-lg border border-gray-200 p-2 text-sm"
                rows={3}
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={submitMutation.isPending || unansweredCount > 0}
        className="mt-4 rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Submit Quiz
      </button>
      {unansweredCount > 0 && (
        <p className="text-muted text-sm mt-2">
          {unansweredCount} question{unansweredCount === 1 ? "" : "s"} left to
          answer.
        </p>
      )}
      {submitMutation.isError && (
        <p className="text-danger text-sm mt-2">
          Couldn't submit — please try again.
        </p>
      )}
    </div>
  );
}
