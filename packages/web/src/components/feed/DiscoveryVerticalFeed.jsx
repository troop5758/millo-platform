/**
 * DiscoveryVerticalFeed — fullscreen-style vertical snap feed for For You (one item per viewport).
 * https://milloapp.com
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { VideoPlayer } from '../VideoPlayer';
import { FeedActions } from '../FeedActions';
import { ShopOverlay } from '../ShopOverlay';
import { IconLive, IconEye } from '../Icons';

function fmtViewers(n) {
  if (!n && n !== 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

/** Safe display string when API sends `creator` as object or missing. */
function creatorDisplayName(item) {
  if (!item || typeof item !== 'object') return '';
  if (typeof item.creatorName === 'string' && item.creatorName.trim()) return item.creatorName.trim();
  const c = item.creator;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (c && typeof c === 'object') {
    const s = (c.displayName || c.username || c.name || '').trim();
    if (s) return s;
  }
  return '';
}

function creatorInitial(label) {
  const s = String(label || '').trim();
  if (!s) return '?';
  const first = [...s][0] || '?';
  return first.toUpperCase();
}

function slideKey(item, index) {
  return item?.contentId || item?.id || item?._id || `vf-${index}`;
}

export function DiscoveryVerticalFeed({
  items = [],
  loading = false,
  error = null,
  hasMore = false,
  onLoadMore,
  tracking,
  feedCatalogNote,
  /** `fullscreen` — edge-to-edge TikTok-style viewport under the app chrome */
  variant = 'default',
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || !onLoadMore) return;
    onLoadMore();
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { threshold: 0.1, rootMargin: '240px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const videoUrl = (item) => item.videoUrl || item.streamUrl || item.recordingUrl || null;
  const isLive = (item) => item.type === 'live' || item.status === 'live';

  if (error && items.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center">
        <p className="text-[var(--text-muted)]">{t('common.error')}</p>
      </div>
    );
  }

  if (loading && items.length === 0) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 text-center bg-[var(--bg)]">
        <p className="text-[var(--text)] font-semibold">{t('feed.emptyTitle')}</p>
        <p className="text-sm text-[var(--text-muted)] mt-2">{t('feed.emptySubtitle')}</p>
      </div>
    );
  }

  const isFull = variant === 'fullscreen';
  const slideH = isFull ? 'min-h-[calc(100dvh-4.5rem)] h-[calc(100dvh-4.5rem)]' : 'min-h-[calc(100dvh-9rem)]';
  const scrollMax = isFull ? 'h-[calc(100dvh-4.5rem)] max-h-[calc(100dvh-4.5rem)]' : 'max-h-[calc(100dvh-9rem)]';
  const scrollChrome = isFull
    ? 'overflow-y-scroll snap-y snap-mandatory overscroll-y-contain bg-black'
    : 'overflow-y-scroll snap-y snap-mandatory overscroll-y-contain rounded-2xl border border-[var(--border)] bg-black';

  return (
    <div className={isFull ? 'w-full' : 'w-full max-w-lg mx-auto'}>
      {feedCatalogNote ? (
        <p className="text-[10px] text-[var(--text-muted)] px-2 py-1 text-center border-b border-[var(--border)] shrink-0">
          {feedCatalogNote}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className={`${scrollMax} ${scrollChrome}`}
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {items.map((item, i) => {
          const src = videoUrl(item);
          const live = isLive(item);
          const id = slideKey(item, i);
          return (
            <VerticalSlide
              key={id}
              item={item}
              index={i}
              src={src}
              live={live}
              slideH={slideH}
              tracking={tracking}
            />
          );
        })}
        <div ref={sentinelRef} className="h-16 shrink-0 flex items-center justify-center snap-start">
          {loading && items.length > 0 && (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>
    </div>
  );
}

function VerticalSlide({ item, index, src, live, slideH, tracking }) {
  const rootRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !tracking?.onVisible) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
          tracking.onVisible(item, index);
        }
      },
      { threshold: [0.25, 0.55, 0.85] }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [item, index, tracking]);

  const cid = item?.contentId || item?.id || item?._id;
  const creatorId = item?.creatorId ? String(item.creatorId) : null;
  const viewers = item?.viewers ?? item?.viewerCount;
  const creatorName = creatorDisplayName(item);

  return (
    <div
      ref={rootRef}
      className={`${slideH} w-full snap-start snap-always shrink-0 relative flex items-center justify-center bg-black`}
      style={{ scrollSnapAlign: 'start' }}
    >
      {src ? (
        <VideoPlayer
          src={src}
          poster={item.thumbnailUrl}
          autoPlay={index === 0}
          live={live}
          streamId={live && cid ? String(cid) : null}
          className="absolute inset-0 w-full h-full object-cover"
          showChat={false}
        />
      ) : (
        <Link
          to={live && cid ? `/live/${cid}` : creatorId ? `/creator/${creatorId}` : '/feed'}
          className="absolute inset-0 flex items-center justify-center"
        >
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-900 flex items-center justify-center">
              <span className="text-4xl opacity-30">▶</span>
            </div>
          )}
        </Link>
      )}

      <div className="absolute bottom-20 right-3 flex flex-col items-end gap-4 z-10">
        {cid ? <FeedActions videoId={String(cid)} creatorId={creatorId} /> : null}
        <Link to={creatorId ? `/creator/${creatorId}` : '/feed'} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-[var(--bg-elevated)]">
            {item.avatarUrl ? (
              <img src={item.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-bold">
                {creatorInitial(creatorName)}
              </div>
            )}
          </div>
          <span className="text-xs font-semibold text-white drop-shadow max-w-[5rem] truncate">
            {creatorName || 'Creator'}
          </span>
        </Link>
        {live && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white text-xs font-bold">
            <IconLive className="w-3 h-3" /> LIVE
          </div>
        )}
        {viewers != null && viewers > 0 && (
          <div className="flex items-center gap-1 text-white text-xs drop-shadow">
            <IconEye className="w-4 h-4" />
            {fmtViewers(viewers)}
          </div>
        )}
      </div>

      <ShopOverlay products={item.shopProducts} creatorId={creatorId} />

      <div className="absolute bottom-6 left-3 right-16 z-10">
        <p className="text-white font-semibold text-sm drop-shadow line-clamp-2">
          {item.title || item.caption || item.description || ''}
        </p>
        {creatorId ? (
          <Link to={`/creator/${creatorId}`} className="text-white/90 text-xs hover:underline mt-0.5">
            @{creatorName || 'creator'}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
