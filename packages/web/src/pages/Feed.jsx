import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { useForYouFeed } from '../hooks/useForYouFeed';
import { useGranularFeedTracking } from '../hooks/useGranularFeedTracking';
import { DiscoveryVerticalFeed } from '../components/feed/DiscoveryVerticalFeed';

function contentKey(item, index) {
  return item?.contentId || item?.id || item?._id || String(index);
}

/**
 * Main explore feed — TikTok-style vertical snap (`/feed`).
 * https://milloapp.com
 */
export default function Feed() {
  const { t } = useTranslation();
  const {
    items,
    loading,
    error,
    hasMore,
    fetchNextPage,
    supportsCursorPaging,
    pagingMode,
    pagingMaxWindow,
  } = useForYouFeed();

  const feedCatalogNote = useMemo(() => {
    if (items.length === 0) return undefined;
    if (pagingMode === 'offset_capped') {
      const win = pagingMaxWindow != null ? ` (max ${pagingMaxWindow} ranked slots per session)` : '';
      return `End of feed${win}. Paging is offset-based inside a capped window — order may shift on refresh.`;
    }
    if (!supportsCursorPaging) {
      return 'Showing one ranked page. The API does not expose further pages yet — use Refresh for a new slate.';
    }
    return undefined;
  }, [items.length, pagingMaxWindow, pagingMode, supportsCursorPaging]);

  const {
    trackImpression,
    trackWatchStart,
    trackWatchProgress,
    trackWatchComplete,
    trackLike,
    trackShare,
    trackCommentOpen,
  } = useGranularFeedTracking();

  const seenImpressionsRef = useRef(new Set());

  const onVisible = useCallback(
    (item, index) => {
      const cid = contentKey(item, index);
      if (seenImpressionsRef.current.has(cid)) return;
      seenImpressionsRef.current.add(cid);

      const contentId = item?.contentId || item?.id || item?._id;
      if (!contentId) return;

      trackImpression({
        contentId: String(contentId),
        position: index,
        source: 'for_you',
        contentType: item?.type,
      });
    },
    [trackImpression]
  );

  const tracking = useMemo(
    () => ({
      onVisible,
      onWatchStart: (item, meta = {}) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackWatchStart({
          contentId: String(contentId),
          source: 'for_you',
          contentType: item?.type,
          ...meta,
        });
      },
      onWatchProgress: (item, meta = {}) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackWatchProgress({
          contentId: String(contentId),
          source: 'for_you',
          contentType: item?.type,
          ...meta,
        });
      },
      onWatchComplete: (item, meta = {}) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackWatchComplete({
          contentId: String(contentId),
          source: 'for_you',
          contentType: item?.type,
          ...meta,
        });
      },
      onLike: (item, index) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackLike({
          contentId: String(contentId),
          position: index,
          source: 'for_you',
          contentType: item?.type,
        });
      },
      onShare: (item, index) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackShare({
          contentId: String(contentId),
          position: index,
          source: 'for_you',
          contentType: item?.type,
        });
      },
      onCommentOpen: (item, index) => {
        const contentId = item?.contentId || item?.id || item?._id;
        if (!contentId) return;
        trackCommentOpen({
          contentId: String(contentId),
          position: index,
          source: 'for_you',
          contentType: item?.type,
        });
      },
    }),
    [
      onVisible,
      trackWatchStart,
      trackWatchProgress,
      trackWatchComplete,
      trackLike,
      trackShare,
      trackCommentOpen,
    ]
  );

  const exploreTitle = t('nav.explore');
  const exploreSeo = t('feed.seoTitle');

  return (
    <>
      <SEO title={exploreSeo} path="/feed" />
      <div className="-mx-2 sm:-mx-4">
        <h1 className="sr-only">{exploreTitle}</h1>
        <DiscoveryVerticalFeed
          variant="fullscreen"
          items={items}
          loading={loading}
          error={error}
          hasMore={hasMore}
          onLoadMore={fetchNextPage}
          tracking={tracking}
          feedCatalogNote={feedCatalogNote}
        />
      </div>
    </>
  );
}
