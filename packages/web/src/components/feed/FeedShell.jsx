import React, { useEffect, useRef } from 'react';

function feedItemKey(item, index) {
  return item.contentId || item.id || item._id || `feed-item-${index}`;
}

function FeedCard({ item, index, tracking }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          tracking?.onVisible?.(item, index);
        }
      },
      { threshold: [0.25, 0.6, 0.9] }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [item, index, tracking]);

  const title =
    item.title || item.caption || item.creatorName || item.contentId || 'Content';

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-4"
    >
      <div className="mb-3">
        <div className="font-bold text-[var(--text)] mb-1">{title}</div>
        {item.description ? (
          <div className="text-sm text-[var(--text-muted)]">{item.description}</div>
        ) : null}
        <div className="text-xs text-[var(--text-muted)] mt-1">
          {item.type ? `${item.type}` : ''}
          {item.creatorId ? ` · creator ${item.creatorId}` : ''}
          {item.score != null ? ` · score ${Number(item.score).toFixed(3)}` : ''}
        </div>
      </div>

      {item.videoUrl ? (
        <video
          src={item.videoUrl}
          controls
          playsInline
          className="w-full rounded-xl mb-3 max-h-[480px]"
          onPlay={() =>
            tracking?.onWatchStart?.(item, {
              startedAt: Date.now(),
              position: index,
            })
          }
          onTimeUpdate={(e) =>
            tracking?.onWatchProgress?.(item, {
              progressSeconds: Math.floor(e.currentTarget.currentTime || 0),
              durationSeconds: Math.floor(e.currentTarget.duration || 0),
              position: index,
            })
          }
          onEnded={() =>
            tracking?.onWatchComplete?.(item, {
              completedAt: Date.now(),
              position: index,
            })
          }
        />
      ) : item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          className="w-full rounded-xl mb-3 object-cover max-h-64"
        />
      ) : (
        <div
          className="w-full rounded-xl mb-3 min-h-[160px] flex items-center justify-center text-sm text-[var(--text-muted)] border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]"
          role="status"
        >
          Preview unavailable — content may still load after hydration.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm"
          onClick={() => tracking?.onLike?.(item, index)}
        >
          Like
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm"
          onClick={() => tracking?.onCommentOpen?.(item, index)}
        >
          Comments
        </button>
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm"
          onClick={() => tracking?.onShare?.(item, index)}
        >
          Share
        </button>
      </div>
    </div>
  );
}

export default function FeedShell({
  title,
  items,
  loading,
  error,
  hasMore,
  onLoadMore,
  onRefresh,
  tracking,
  emptyState,
  /** When the API is single-page, explain that scrolling will not load more. */
  feedCatalogNote,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!sentinelRef.current || loading || !hasMore) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onLoadMore?.();
      }
    });

    observer.observe(sentinelRef.current);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex justify-between items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold text-[var(--text)] m-0">{title}</h1>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border border-[var(--border)] text-sm"
          onClick={onRefresh}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load feed.'}
        </div>
      ) : null}

      {!loading && (!items || items.length === 0) ? (
        <div className="text-[var(--text-muted)] py-8">{emptyState || 'Nothing to show right now.'}</div>
      ) : null}

      <div>
        {items?.map((item, index) => (
          <FeedCard
            key={feedItemKey(item, index)}
            item={item}
            index={index}
            tracking={tracking}
          />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {loading ? <div className="py-4 text-[var(--text-muted)]">Loading…</div> : null}
      {!hasMore && items?.length ? (
        <div className="py-4 text-sm text-[var(--text-muted)]">
          {feedCatalogNote || 'End of feed.'}
        </div>
      ) : null}
    </div>
  );
}
