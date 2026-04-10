import { useCallback, useRef } from 'react';
import {
  trackFeedImpression,
  trackFeedWatchStart,
  trackFeedWatchProgress,
  trackFeedWatchComplete,
  trackFeedLike,
  trackFeedShare,
  trackFeedCommentOpen,
} from '../sdk/contentApi';

/**
 * Granular feed analytics mapped to Millo POST /feed/events/*.
 */
export function useGranularFeedTracking() {
  const progressBufferRef = useRef(new Map());

  const safeTrack = useCallback(async (fn, payload) => {
    try {
      await fn(payload);
    } catch (err) {
      console.warn('Feed tracking failed:', err, payload);
    }
  }, []);

  const trackImpression = useCallback(
    (payload) => safeTrack(trackFeedImpression, payload),
    [safeTrack]
  );

  const trackWatchStart = useCallback(
    (payload) => safeTrack(trackFeedWatchStart, payload),
    [safeTrack]
  );

  const trackWatchProgress = useCallback(
    (payload) => {
      const key = payload?.contentId;
      if (!key) return;

      const previous = progressBufferRef.current.get(key) || 0;
      const next = payload?.progressSeconds || 0;

      if (next - previous < 2) return;

      progressBufferRef.current.set(key, next);
      safeTrack(trackFeedWatchProgress, payload);
    },
    [safeTrack]
  );

  const trackWatchComplete = useCallback(
    (payload) => safeTrack(trackFeedWatchComplete, payload),
    [safeTrack]
  );

  const trackLike = useCallback(
    (payload) => safeTrack(trackFeedLike, payload),
    [safeTrack]
  );

  const trackShare = useCallback(
    (payload) => safeTrack(trackFeedShare, payload),
    [safeTrack]
  );

  const trackCommentOpen = useCallback(
    (payload) => safeTrack(trackFeedCommentOpen, payload),
    [safeTrack]
  );

  return {
    trackImpression,
    trackWatchStart,
    trackWatchProgress,
    trackWatchComplete,
    trackLike,
    trackShare,
    trackCommentOpen,
  };
}
