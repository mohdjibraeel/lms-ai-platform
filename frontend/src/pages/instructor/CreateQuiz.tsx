import { useParams, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

type QuestionType = "mcq" | "multi_select" | "short_answer";

interface OptionDraft {
  option_text: string;
  is_correct: boolean;
}

interface QuestionDraft {
  question_text: string;
  question_type: QuestionType;
  options: OptionDraft[];
}

function newQuestion(): QuestionDraft {
  return {
    question_text: "",
    question_type: "mcq",
    options: [
      { option_text: "", is_correct: false },
      { option_text: "", is_correct: false },
    ],
  };
}

export default function CreateQuiz() {
  const { moduleId } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([newQuestion()]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        module_id: moduleId,
        title,
        questions: questions.map((q, index) => ({
          question_text: q.question_text,
          question_type: q.question_type,
          order_index: index + 1,
          options:
            q.question_type === "short_answer"
              ? []
              : q.options
                  .filter((o) => o.option_text.trim() !== "")
                  .map((o) => ({
                    option_text: o.option_text,
                    is_correct: o.is_correct,
                  })),
        })),
      };
      const response = await api.post<{ quiz_id: string }>("/quizzes", payload);
      return response.data;
    },
    onSuccess: () => {
      navigate(`/instructor/courses`);
    },
  });

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q))
    );
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, newQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function updateOption(qIndex: number, oIndex: number, patch: Partial<OptionDraft>) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const options = q.options.map((o, j) =>
          j === oIndex ? { ...o, ...patch } : o
        );
        return { ...q, options };
      })
    );
  }

  // For MCQ, only one option can be correct — selecting one clears the rest.
  function selectSingleCorrect(qIndex: number, oIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const options = q.options.map((o, j) => ({
          ...o,
          is_correct: j === oIndex,
        }));
        return { ...q, options };
      })
    );
  }

  function addOption(qIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: [...q.options, { option_text: "", is_correct: false }] }
          : q
      )
    );
  }

  function removeOption(qIndex: number, oIndex: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIndex
          ? { ...q, options: q.options.filter((_, j) => j !== oIndex) }
          : q
      )
    );
  }

  // Basic validation — every question needs text, and mcq/multi_select
  // questions need at least one option marked correct before submitting.
  const isValid =
    title.trim() !== "" &&
    questions.length > 0 &&
    questions.every((q) => {
      if (q.question_text.trim() === "") return false;
      if (q.question_type === "short_answer") return true;
      const filledOptions = q.options.filter((o) => o.option_text.trim() !== "");
      return filledOptions.length >= 2 && filledOptions.some((o) => o.is_correct);
    });

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Create Quiz</h1>

      <input
        type="text"
        placeholder="Quiz title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-lg border border-gray-200 p-2 text-sm mb-6"
      />

      <div className="space-y-6">
        {questions.map((question, qIndex) => (
          <div key={qIndex} className="rounded-2xl shadow-md bg-white p-4">
            <div className="flex justify-between items-start gap-2 mb-2">
              <input
                type="text"
                placeholder={`Question ${qIndex + 1}`}
                value={question.question_text}
                onChange={(e) =>
                  updateQuestion(qIndex, { question_text: e.target.value })
                }
                className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
              />
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIndex)}
                  className="text-danger text-sm"
                >
                  Remove
                </button>
              )}
            </div>

            <select
              value={question.question_type}
              onChange={(e) =>
                updateQuestion(qIndex, {
                  question_type: e.target.value as QuestionType,
                })
              }
              className="rounded-lg border border-gray-200 p-2 text-sm mb-3"
            >
              <option value="mcq">Multiple choice (one answer)</option>
              <option value="multi_select">Multi-select (multiple answers)</option>
              <option value="short_answer">Short answer (manual grading)</option>
            </select>

            {question.question_type !== "short_answer" && (
              <div className="space-y-2">
                {question.options.map((option, oIndex) => (
                  <div key={oIndex} className="flex items-center gap-2">
                    <input
                      type={question.question_type === "mcq" ? "radio" : "checkbox"}
                      name={`correct-${qIndex}`}
                      checked={option.is_correct}
                      onChange={() =>
                        question.question_type === "mcq"
                          ? selectSingleCorrect(qIndex, oIndex)
                          : updateOption(qIndex, oIndex, {
                              is_correct: !option.is_correct,
                            })
                      }
                    />
                    <input
                      type="text"
                      placeholder={`Option ${oIndex + 1}`}
                      value={option.option_text}
                      onChange={(e) =>
                        updateOption(qIndex, oIndex, { option_text: e.target.value })
                      }
                      className="flex-1 rounded-lg border border-gray-200 p-2 text-sm"
                    />
                    {question.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(qIndex, oIndex)}
                        className="text-danger text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addOption(qIndex)}
                  className="text-sm text-link"
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="mt-4 rounded-full bg-white shadow-md px-4 py-2 text-sm font-medium text-gray-700"
      >
        + Add question
      </button>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!isValid || createMutation.isPending}
          className="rounded-full bg-accent-green px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create Quiz"}
        </button>
        {createMutation.isError && (
          <p className="text-danger text-sm mt-2">
            Couldn't create quiz — please check all fields and try again.
          </p>
        )}
      </div>
    </div>
  );
}