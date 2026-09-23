import { useParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import api from "../../services/api";
import ReactMarkdown from "react-markdown";

interface Source {
  lecture_id: string;
  lecture_title: string;
  timestamp_seconds: number | null;
}

interface ChatMessage {
  sender: "user" | "ai";
  content: string;
  sources?: Source[];
}

type Mode = "beginner" | "intermediate" | "advanced";

export default function AiTutor() {
  const { courseId } = useParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("intermediate");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ session_id: string; mode: Mode }>(
        "/ai/chat/sessions",
        { course_id: courseId },
      );
      return response.data;
    },
    onSuccess: (data) => {
      setSessionId(data.session_id);
      setMode(data.mode);
    },
    onError: (err: any) => {
      const code = err.response?.data?.error?.code;
      if (code === "AI_ACCESS_DENIED") {
        setErrorMessage(
          "You need to be enrolled in this course to use the AI Tutor.",
        );
      } else {
        setErrorMessage("Couldn't start a chat session. Please try again.");
      }
    },
  });

  // Kick off a session the first time this page loads, only once.
  if (
    !sessionId &&
    !startSessionMutation.isPending &&
    !startSessionMutation.isError
  ) {
    startSessionMutation.mutate();
  }

  const sendMessageMutation = useMutation({
    mutationFn: async (text: string) => {
      const response = await api.post<{
        reply: string;
        sources: Source[];
        mode: Mode;
      }>(`/ai/chat/sessions/${sessionId}/messages`, { message: text });
      return response.data;
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { sender: "ai", content: data.reply, sources: data.sources },
      ]);
    },
    onError: (err: any) => {
      const code = err.response?.data?.error?.code;
      const text =
        code === "AI_QUOTA_EXCEEDED"
          ? "Daily AI usage limit reached. Please try again tomorrow."
          : "Something went wrong getting a reply. Please try again.";
      setMessages((prev) => [...prev, { sender: "ai", content: text }]);
    },
  });

  const changeModeMutation = useMutation({
    mutationFn: async (newMode: Mode) => {
      await api.put(`/ai/chat/sessions/${sessionId}/mode`, { mode: newMode });
      return newMode;
    },
    onSuccess: (newMode) => setMode(newMode),
  });

  function handleSend() {
    const text = draft.trim();
    if (!text || !sessionId) return;
    setMessages((prev) => [...prev, { sender: "user", content: text }]);
    setDraft("");
    sendMessageMutation.mutate(text);
  }

  if (startSessionMutation.isError) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6">
        <p className="text-danger text-sm">{errorMessage}</p>
        <Link
          to={`/courses/${courseId}`}
          className="text-link text-sm mt-2 inline-block"
        >
          Back to course
        </Link>
      </div>
    );
  }

  if (!sessionId) {
    return <p className="text-muted text-sm">Starting AI Tutor session...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto rounded-2xl shadow-md bg-white p-6 flex flex-col h-[75vh]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-gray-900">AI Tutor</h1>
        <select
          value={mode}
          onChange={(e) => changeModeMutation.mutate(e.target.value as Mode)}
          className="text-sm border border-gray-200 rounded-full px-3 py-1"
        >
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-3 mb-4">
        {messages.length === 0 && (
          <p className="text-muted text-sm">
            Ask a question about this course's lectures.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-xl p-3 text-sm max-w-[85%] ${
              msg.sender === "user"
                ? "bg-black text-white self-end"
                : "bg-gray-100 text-gray-900 self-start"
            }`}
          >
            {msg.sender === "ai" ? (
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            ) : (
              <p>{msg.content}</p>
            )}
            {msg.sources && msg.sources.length > 0 && (
              <p className="text-xs text-muted mt-2">
                Source: {msg.sources.map((s) => s.lecture_title).join(", ")}
              </p>
            )}
          </div>
        ))}
        {sendMessageMutation.isPending && (
          <p className="text-muted text-sm">Thinking...</p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Ask a question..."
          className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={sendMessageMutation.isPending || !draft.trim()}
          className="bg-black text-white rounded-full px-5 py-2 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
