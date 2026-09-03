import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "../../services/api";

interface VideoUrlResponse {
  url: string;
}

export default function CoursePlayer() {
  const { lectureId } = useParams();

  const { data, isLoading, error } = useQuery<VideoUrlResponse>({
    queryKey: ["lecture-video", lectureId],
    queryFn: async () => {
      const response = await api.get(`/courses/lectures/${lectureId}/video-url`);
      return response.data;
    },
    enabled: !!lectureId,
  });

  if (isLoading) {
    return <p className="text-muted text-sm">Loading video...</p>;
  }

  if (error) {
    return <p className="text-danger text-sm">Failed to load video.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-4">
        Lecture Player
      </h1>

      {data?.url ? (
        <video
          controls
          src={data.url}
          className="w-full rounded-xl shadow-md bg-black"
        >
          Your browser does not support video playback.
        </video>
      ) : (
        <p className="text-muted text-sm">No video available for this lecture.</p>
      )}
    </div>
  );
}