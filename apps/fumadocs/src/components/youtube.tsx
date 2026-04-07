"use client";

export function YouTube({ id }: { id: string }) {
  return (
    <iframe
      className="w-full aspect-video rounded-lg my-4"
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}
