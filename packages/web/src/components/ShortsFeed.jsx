/**
 * ShortsFeed — TikTok-style vertical full-screen short video feed.
 * Snap scroll, one video per viewport, infinite load on scroll.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { VideoPlayer } from './VideoPlayer';
import { FeedActions } from './FeedActions';
import { ShopOverlay } from './ShopOverlay';
import { IconLive, IconEye } from './Icons';
import { fetchFeed } from '../sdk/contentApi';

const PAGE_SIZE = 10;

function fmtViewers(n) {
  if (!n && n !== 0) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

export function ShortsFeed({ tab = 'shorts', category = 'all' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  const load = useCallback(async (off = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const data = await fetchFeed(tab, category, PAGE_SIZE, off);
      const fetched = data.items ?? [];
      setItems((prev) => (append ? [...prev, ...fetched] : fetched));
      setHasMore(fetched.length >= PAGE_SIZE);
      setOffset((o) => (append ? o + fetched.length : fetched.length));
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tab, category]);

  useEffect(() => {
    load(0, false);
  }, [tab, category]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    load(offset, true);
  }, [offset, hasMore, loading, loadingMore, load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { threshold: 0.1, rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  const videoUrl = (item) => item.streamUrl || item.recordingUrl || null;
  const isLive = (item) => item.type === 'live' || item.status === 'live';

  if (loading && items.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white p-8 text-center">
        <p className="text-lg font-semibold">{t('feed.emptyTitle')}</p>
        <p className="text-sm text-white/70 mt-2">{t('feed.emptySubtitle')}</p>
        <button
          type="button"
          onClick={() => navigate('/feed')}
          className="mt-6 px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-semibold hover:bg-[var(--accent-hover)]"
        >
          {t('feed.browseForyou')}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen overflow-y-scroll snap-y snap-mandatory overscroll-none"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      {items.map((item, i) => {
        const src = videoUrl(item);
        const live = isLive(item);
        return (
          <div
            key={item.id}
            className="h-screen w-full snap-start snap-always shrink-0 relative flex items-center justify-center bg-black"
            style={{ scrollSnapAlign: 'start' }}
          >
            {src ? (
              <VideoPlayer
                src={src}
                poster={item.thumbnailUrl}
                autoPlay={i === 0}
                live={live}
                streamId={live ? String(item.id) : null}
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <Link
                to={item.type === 'live' ? `/live/${item.id}` : `/creator/${item.creatorId}`}
                className="absolute inset-0 flex items-center justify-center"
              >
                {item.thumbnailUrl ? (
                  <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-slate-900 flex items-center justify-center">
                    <span className="text-4xl opacity-30">▶</span>
                  </div>
                )}
              </Link>
            )}

            {/* Right rail overlay — actions, creator, title */}
            <div className="absolute bottom-20 right-3 flex flex-col items-end gap-4 z-10">
              <FeedActions videoId={item.id} creatorId={item.creatorId} />
              <Link
                to={item.creatorId ? `/creator/${item.creatorId}` : '#'}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-[var(--bg-elevated)]">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={item.creator} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {item.creator?.[0] || '?'}
                    </div>
                  )}
                </div>
                <span className="text-xs font-semibold text-white drop-shadow">{item.creator}</span>
              </Link>
              {live && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white text-xs font-bold">
                  <IconLive className="w-3 h-3" /> LIVE
                </div>
              )}
              {item.viewers != null && item.viewers > 0 && (
                <div className="flex items-center gap-1 text-white text-xs drop-shadow">
                  <IconEye className="w-4 h-4" />
                  {fmtViewers(item.viewers)}
                </div>
              )}
            </div>

            {/* Shop the look overlay */}
            <ShopOverlay products={item.shopProducts} creatorId={item.creatorId} />

            {/* Bottom title */}
            <div className="absolute bottom-6 left-3 right-16 z-10">
              <p className="text-white font-semibold text-sm drop-shadow line-clamp-2">{item.title}</p>
              <Link
                to={item.creatorId ? `/creator/${item.creatorId}` : '#'}
                className="text-white/90 text-xs hover:underline mt-0.5"
              >
                @{item.creator}
              </Link>
            </div>
          </div>
        );
      })}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-20 shrink-0 flex items-center justify-center">
        {loadingMore && (
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
