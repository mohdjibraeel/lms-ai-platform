import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  posted_by_name: string | null;
}

const VISIBLE_BY_DEFAULT = 3;

export default function AnnouncementsList({ courseId }: { courseId: string }) {
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["announcements", courseId],
    queryFn: async () => {
      const response = await api.get<{ announcements: Announcement[] }>(
        `/courses/${courseId}/announcements`,
      );
      return response.data.announcements;
    },
  });

  if (isLoading) return null;

  if (isError) {
    return (
      <p className="text-sm text-muted mb-6">Couldn't load announcements.</p>
    );
  }

  // Nothing posted yet → show nothing at all, so the page stays uncluttered.
  if (!data || data.length === 0) return null;

  const visible = showAll ? data : data.slice(0, VISIBLE_BY_DEFAULT);

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        📢 Announcements
      </h2>
      <div className="flex flex-col gap-3">
        {visible.map((announcement) => (
          <div
            key={announcement.id}
            className="bg-white border border-gray-100 rounded-xl p-4"
          >
            <h3 className="font-medium text-gray-900">{announcement.title}</h3>
            <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap wrap-break-word">
              {announcement.content}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {announcement.posted_by_name
                ? `Posted by ${announcement.posted_by_name} · `
                : ""}
              {new Date(announcement.created_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        ))}
      </div>
      {data.length > VISIBLE_BY_DEFAULT && (
        <button
          type="button"
          onClick={() => setShowAll((prev) => !prev)}
          className="mt-2 text-sm text-link hover:underline"
        >
          {showAll ? "Show fewer" : `Show all ${data.length} announcements`}
        </button>
      )}
    </div>
  );
}
