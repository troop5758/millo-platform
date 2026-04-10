/**
 * FeedActions — Like, Comment, Save, Share for short video feed cards.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  likeVideo,
  unlikeVideo,
  saveVideo,
  unsaveVideo,
  shareVideo,
  addCommentVideo,
  fetchVideoEngagement,
} from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { IconHeart, IconHeartSolid } from './Icons';

function fmtCount(n) {
  if (n == null || n === undefined) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

export function FeedActions({ videoId, creatorId, onCommentOpen }) {
  const { t } = useTranslation();
  const user = getUser();
  const [engagement, setEngagement] = useState({ likes: 0, shares: 0, comments: 0, saves: 0, liked: false, saved: false });
  const [loading, setLoading] = useState({ like: false, save: false, share: false, comment: false });

  const load = useCallback(async () => {
    if (!videoId) return;
    try {
      const data = await fetchVideoEngagement(videoId);
      setEngagement(data);
    } catch {
      // Unauthenticated or API error — keep defaults
    }
  }, [videoId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLike = async () => {
    if (!user) return;
    if (loading.like) return;
    setLoading((l) => ({ ...l, like: true }));
    try {
      if (engagement.liked) {
        await unlikeVideo(videoId);
        setEngagement((e) => ({ ...e, liked: false, likes: Math.max(0, (e.likes || 0) - 1) }));
      } else {
        await likeVideo(videoId);
        setEngagement((e) => ({ ...e, liked: true, likes: (e.likes || 0) + 1 }));
      }
    } catch {
      // Ignore
    } finally {
      setLoading((l) => ({ ...l, like: false }));
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (loading.save) return;
    setLoading((l) => ({ ...l, save: true }));
    try {
      if (engagement.saved) {
        await unsaveVideo(videoId);
        setEngagement((e) => ({ ...e, saved: false, saves: Math.max(0, (e.saves || 0) - 1) }));
      } else {
        await saveVideo(videoId);
        setEngagement((e) => ({ ...e, saved: true, saves: (e.saves || 0) + 1 }));
      }
    } catch {
      // Ignore
    } finally {
      setLoading((l) => ({ ...l, save: false }));
    }
  };

  const handleShare = async () => {
    if (loading.share) return;
    setLoading((l) => ({ ...l, share: true }));
    const base = window.location.origin;
    const url = creatorId ? `${base}/creator/${creatorId}/replays/${videoId}` : `${base}/feed?shorts=1`;
    try {
      if (user) await shareVideo(videoId).then(() => setEngagement((e) => ({ ...e, shares: (e.shares || 0) + 1 })));
      if (navigator.share) {
        await navigator.share({ title: 'Millo', text: 'Check this out on Millo', url });
      } else {
        await navigator.clipboard?.writeText(url);
      }
    } catch {
      try {
        await navigator.clipboard?.writeText(url);
      } catch {}
    } finally {
      setLoading((l) => ({ ...l, share: false }));
    }
  };

  const handleComment = () => {
    if (onCommentOpen) {
      onCommentOpen();
    } else if (user) {
      // Simple: could open a modal or navigate
      const text = window.prompt(t('feed.addComment') || 'Add a comment...');
      if (text?.trim()) {
        setLoading((l) => ({ ...l, comment: true }));
        addCommentVideo(videoId, text.trim())
          .then(() => {
            setEngagement((e) => ({ ...e, comments: (e.comments || 0) + 1 }));
          })
          .finally(() => setLoading((l) => ({ ...l, comment: false })));
      }
    }
  };

  const btn = 'flex flex-col items-center gap-0.5 text-white drop-shadow cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50';
  const iconCls = 'w-8 h-8';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Like */}
      <button type="button" onClick={handleLike} className={btn} disabled={!user || loading.like} aria-label="Like">
        {engagement.liked ? (
          <IconHeartSolid className={`${iconCls} text-red-500`} />
        ) : (
          <IconHeart className={iconCls} />
        )}
        <span className="text-xs font-medium">{fmtCount(engagement.likes)}</span>
      </button>

      {/* Comment */}
      <button type="button" onClick={handleComment} className={btn} disabled={!user || loading.comment} aria-label="Comment">
        <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <span className="text-xs font-medium">{fmtCount(engagement.comments)}</span>
      </button>

      {/* Save */}
      <button type="button" onClick={handleSave} className={btn} disabled={!user || loading.save} aria-label="Save">
        <svg className={iconCls} fill={engagement.saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
        <span className="text-xs font-medium">{fmtCount(engagement.saves)}</span>
      </button>

      {/* Share */}
      <button type="button" onClick={handleShare} className={btn} disabled={loading.share} aria-label="Share">
        <svg className={iconCls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="text-xs font-medium">{fmtCount(engagement.shares)}</span>
      </button>
    </div>
  );
}
