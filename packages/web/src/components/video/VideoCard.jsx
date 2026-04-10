import React from 'react';

/**
 * VideoCard — TikTok-style feed item.
 *
 * Expected `video` shape (best-effort):
 * - url: string (video src)
 * - title: string
 */
export default function VideoCard({ video }) {
  const title = video?.title || '';
  const url = video?.url || '';

  return (
    <div className="rounded-2xl overflow-hidden bg-[#111]">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={url} className="w-full" controls={false} playsInline muted />
      <div className="p-2">
        <h3 className="text-sm font-semibold text-[var(--text)] truncate">{title}</h3>
      </div>
    </div>
  );
}

