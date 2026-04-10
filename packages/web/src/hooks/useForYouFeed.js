import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDiscoveryForYou, fetchFeed } from '../sdk/contentApi';

function creatorLabelFromItem(it) {
  if (!it || typeof it !== 'object') return '';
  if (typeof it.creatorName === 'string' && it.creatorName.trim()) return it.creatorName.trim();
  if (typeof it.creator === 'string' && it.creator.trim()) return it.creator.trim();
  const c = it.creator;
  if (c && typeof c === 'object') {
    const s = (c.displayName || c.username || c.name || '').trim();
    if (s) return s;
  }
  return '';
}

/**
 * Normalize `/content/feed` rows for FeedShell (video URL + stable id).
 */
function normalizeGuestFeedItem(it) {
  if (!it || typeof it !== 'object') return it;
  const label = creatorLabelFromItem(it);
  return {
    ...it,
    contentId: it.contentId || it.id || it._id,
    videoUrl: it.videoUrl || it.streamUrl || it.recordingUrl || null,
    ...(label ? { creatorName: label } : {}),
  };
}

/** Discovery `/feed/for-you` — same id/video/creator hygiene as guest feed. */
function normalizeDiscoveryFeedItem(it) {
  if (!it || typeof it !== 'object') return it;
  const label = creatorLabelFromItem(it);
  return {
    ...it,
    contentId: it.contentId || it.id || it._id,
    videoUrl: it.videoUrl || it.streamUrl || it.recordingUrl || null,
    ...(label ? { creatorName: label } : {}),
  };
}

/**
 * Discovery For You (`GET /feed/for-you`). Pagination when API returns `nextCursor` / `hasMore`.
 * Guests get **401** on `/api/feed`; fall back to public `GET /content/feed?tab=foryou`.
 */
export function useForYouFeed() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [supportsCursorPaging, setSupportsCursorPaging] = useState(false);
  const [pagingMode, setPagingMode] = useState(null);
  const [pagingMaxWindow, setPagingMaxWindow] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const cursorRef = useRef(null);
  const mountedLoadRef = useRef(false);
  /** 'discovery' | 'guest' — set when /feed/for-you returns 401 */
  const feedModeRef = useRef('discovery');
  const guestOffsetRef = useRef(0);

  const runLoad = useCallback(async (reset) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (feedModeRef.current === 'guest') {
        const offset = reset ? 0 : guestOffsetRef.current;
        const data = await fetchFeed('foryou', 'all', 20, offset);
        const raw = data?.items || data?.data || [];
        const nextItems = raw.map(normalizeGuestFeedItem);
        if (reset) guestOffsetRef.current = 0;
        guestOffsetRef.current += nextItems.length;
        setSupportsCursorPaging(false);
        setPagingMode('guest_public_feed');
        setPagingMaxWindow(null);
        cursorRef.current = null;
        setCursor(null);
        setHasMore(nextItems.length >= 20);
        setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
        return;
      }

      const c = reset ? null : cursorRef.current;
      const response = await fetchDiscoveryForYou({
        limit: 20,
        cursor: c || undefined,
      });
      const rawDiscovery = response?.items || response?.data || [];
      const nextItems = rawDiscovery.map(normalizeDiscoveryFeedItem);
      const nextCursor = response?.nextCursor ?? null;
      const nextHasMore = Boolean(response?.hasMore ?? nextCursor);
      setSupportsCursorPaging(Boolean(nextCursor) || response?.hasMore === true);
      setPagingMode(response?.pagingMode ?? null);
      setPagingMaxWindow(
        response?.pagingMaxWindow != null && Number.isFinite(Number(response.pagingMaxWindow))
          ? Number(response.pagingMaxWindow)
          : null
      );
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      setHasMore(nextHasMore);
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
    } catch (err) {
      if (err?.status === 401 && feedModeRef.current === 'discovery') {
        feedModeRef.current = 'guest';
        guestOffsetRef.current = 0;
        try {
          const data = await fetchFeed('foryou', 'all', 20, 0);
          const raw = data?.items || data?.data || [];
          const nextItems = raw.map(normalizeGuestFeedItem);
          guestOffsetRef.current = nextItems.length;
          setSupportsCursorPaging(false);
          setPagingMode('guest_public_feed');
          setPagingMaxWindow(null);
          cursorRef.current = null;
          setCursor(null);
          setHasMore(nextItems.length >= 20);
          setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
          setError(null);
        } catch (e2) {
          setError(e2);
        }
      } else {
        setError(err);
      }
    } finally {
      busyRef.current = false;
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (mountedLoadRef.current) return;
    mountedLoadRef.current = true;
    runLoad(true);
  }, [runLoad]);

  const refresh = useCallback(async () => {
    cursorRef.current = null;
    guestOffsetRef.current = 0;
    setCursor(null);
    setHasMore(true);
    busyRef.current = false;
    await runLoad(true);
  }, [runLoad]);

  const fetchNextPage = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
    await runLoad(false);
  }, [hasMore, runLoad]);

  return {
    items,
    loading,
    error,
    hasMore,
    supportsCursorPaging,
    pagingMode,
    pagingMaxWindow,
    refresh,
    fetchNextPage,
  };
}

export default useForYouFeed;
