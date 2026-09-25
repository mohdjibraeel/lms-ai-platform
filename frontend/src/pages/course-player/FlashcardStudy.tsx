import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";

interface Flashcard {
  id: string;
  question: string;
  answer: string;
}

interface FlashcardsResponse {
  module_id: string;
  generated_at: string | null;
  flashcards: Flashcard[];
}

export default function FlashcardStudy() {
  const { moduleId } = useParams();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const { data, isLoading, error } = useQuery<FlashcardsResponse>({
    queryKey: ["module-flashcards", moduleId],
    queryFn: async () => {
      const response = await api.get(`/modules/${moduleId}/flashcards`);
      return response.data;
    },
    enabled: !!moduleId,
  });

  if (isLoading) return <p className="text-muted text-sm">Loading flashcards...</p>;
  if (error)
    return <p className="text-danger text-sm">Couldn't load flashcards.</p>;

  const cards = data?.flashcards ?? [];

  if (cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl shadow-md bg-white p-6 text-center">
        <p className="text-muted text-sm">
          No flashcards yet for this module. Ask your instructor to generate some.
        </p>
      </div>
    );
  }

  const card = cards[index];

  function goNext() {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, cards.length - 1));
  }

  function goPrevious() {
    setFlipped(false);
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">
        📚 Flashcards
      </h1>
      <p className="text-sm text-muted mb-4">
        Card {index + 1} of {cards.length}
      </p>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="w-full min-h-50 rounded-2xl shadow-md bg-white p-6 flex items-center justify-center text-center"
      >
        <p className="text-lg text-gray-900">
          {flipped ? card.answer : card.question}
        </p>
      </button>
      <p className="text-xs text-muted text-center mt-2">
        Tap the card to {flipped ? "see the question" : "reveal the answer"}
      </p>

      <div className="flex justify-between items-center mt-4">
        <button
          type="button"
          onClick={goPrevious}
          disabled={index === 0}
          className="rounded-full bg-white shadow-md px-4 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={index === cards.length - 1}
          className="rounded-full bg-accent-green px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Next →
        </button>
      </div>

      <Link
        to="/dashboard"
        className="mt-6 inline-block text-sm text-link underline"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}