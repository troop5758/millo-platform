/**
 * ReplayPage — full-page VOD replay viewer.
 * Route: /creator/:id/replays/:replayId
 * Fetches from GET /content/vod/:replayId
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { VideoPlayer } from '../components/VideoPlayer';
import { SoundAttribution } from '../components/SoundAttribution';
import { fetchVOD, fetchVODs } from '../sdk/contentApi';

async function fetchCreatorVODs(creatorId, excludeId) {
  const data = await fetchVODs({ creatorId, limit: 6 });
  return (data.vods || []).filter((v) => String(v._id) !== String(excludeId));
}

function fmt(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgoStr(t, date) {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date)) / 86400000);
  if (days === 0) return t('replay.today');
  if (days === 1) return t('replay.yesterday');
  if (days < 7)  return t('replay.daysAgo', { count: days });
  if (days < 30) return t('replay.weeksAgo', { count: Math.floor(days / 7) });
  return t('replay.monthsAgo', { count: Math.floor(days / 30) });
}

function IconBack(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function IconClock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function IconEye(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SidebarVODCard({ vod, creatorId }) {
  const { t } = useTranslation();
  const dur = fmt(vod.recordingDuration);
  return (
    <Link to={`/creator/${creatorId}/replays/${vod._id}`}
      className="flex gap-3 group hover:bg-[var(--bg-elevated)] rounded-xl p-2 transition-colors">
      <div className="relative w-32 aspect-video rounded-lg bg-[var(--bg-elevated)] overflow-hidden shrink-0">
        {vod.thumbnailUrl
          ? <img src={vod.thumbnailUrl} alt={vod.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>}
        {dur && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/70 text-white">
            {dur}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)] truncate leading-snug group-hover:text-[var(--accent)] transition-colors">
          {vod.title || t('replay.untitled')}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-1">{timeAgoStr(t, vod.endedAt)}</p>
        {vod.viewerCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] mt-1">
            <IconEye className="w-3 h-3" /> {vod.viewerCount.toLocaleString()}
          </span>
        )}
      </div>
    </Link>
  );
}

export function ReplayPage() {
  const { id: creatorId, replayId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [vod,       setVod]       = useState(null);
  const [related,   setRelated]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchVOD(replayId)
      .then((data) => {
        setVod(data);
        const uid = String(data.userId || data.creator?.userId || creatorId);
        fetchCreatorVODs(uid, replayId).then(setRelated).catch(() => {});
      })
      .catch(() => setError(t('replay.notAvailable')))
      .finally(() => setLoading(false));
  }, [replayId, creatorId, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <SEO title={t('replay.notFoundSeo')} path={`/creator/${creatorId}/replays/${replayId}`} />
        <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-4">
          <svg className="w-16 h-16 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-lg font-semibold text-[var(--text)]">{error}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
              {t('common.goBack')}
            </button>
            <Link to={`/creator/${creatorId}`}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
              {t('replay.creatorProfile')}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const creator      = vod.creator || {};
  const displayName  = creator.displayName || t('replay.creator');
  const resolvedCreatorId = String(vod.userId || creatorId);
  const dur          = fmt(vod.recordingDuration);
  const peakViewers  = vod.peakViewers || vod.viewerCount;

  return (
    <>
      <SEO
        title={t('replay.seoTitle', { title: vod.title || t('replay.untitled'), creator: displayName })}
        description={t('replay.seoDesc', { title: vod.title || t('replay.thisStream'), creator: displayName })}
        path={`/creator/${creatorId}/replays/${replayId}`}
      />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Back breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors text-sm font-medium">
            <IconBack className="w-4 h-4" />
          </button>
          <Link to={`/creator/${resolvedCreatorId}`}
            className="text-sm text-[var(--accent)] hover:underline font-medium">
            {displayName}
          </Link>
          <span className="text-[var(--text-muted)] text-sm">/</span>
          <span className="text-sm text-[var(--text-muted)] truncate max-w-[200px]">
            {vod.title || t('replay.untitled')}
          </span>
        </div>

        <div className="grid xl:grid-cols-3 gap-6">
          {/* Left: player + info */}
          <div className="xl:col-span-2 space-y-4">
            {/* Video player */}
            <div className="rounded-2xl overflow-hidden bg-black shadow-xl">
              <VideoPlayer
                src={vod.recordingUrl}
                poster={vod.thumbnailUrl}
                live={false}
                autoPlay={false}
                className="rounded-none"
              />
            </div>

            {/* Video metadata */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h1 className="text-xl font-bold text-[var(--text)] mb-3 leading-snug">
                {vod.title || t('replay.untitled')}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--text-muted)]">
                {dur && (
                  <span className="flex items-center gap-1.5">
                    <IconClock className="w-4 h-4" /> {dur}
                  </span>
                )}
                {peakViewers > 0 && (
                  <span className="flex items-center gap-1.5">
                    <IconEye className="w-4 h-4" /> {t('replay.peakViewers', { count: peakViewers.toLocaleString() })}
                  </span>
                )}
                {vod.endedAt && (
                  <span>{timeAgoStr(t, vod.endedAt)}</span>
                )}
                {vod.category && (
                  <span className="capitalize px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] text-xs font-medium text-[var(--text)]">
                    {vod.category}
                  </span>
                )}
              </div>
              {vod.sound && (
                <div className="mt-3">
                  <SoundAttribution sound={vod.sound} />
                </div>
              )}

              <hr className="my-4 border-[var(--border)]" />

              {/* Creator row */}
              <div className="flex items-center gap-3">
                <Link to={`/creator/${resolvedCreatorId}`} className="shrink-0">
                  <div className="w-11 h-11 rounded-full bg-[var(--accent)]/15 overflow-hidden flex items-center justify-center">
                    {creator.avatarUrl
                      ? <img src={creator.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      : <span className="text-base font-bold text-[var(--accent)]">{displayName[0]}</span>}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/creator/${resolvedCreatorId}`}
                    className="font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors truncate block">
                    {displayName}
                  </Link>
                  {(creator.followersCount || 0) > 0 && (
                    <p className="text-xs text-[var(--text-muted)]">
                      {t('replay.followers', { count: creator.followersCount.toLocaleString() })}
                    </p>
                  )}
                </div>
                <Link to={`/creator/${resolvedCreatorId}`}
                  className="shrink-0 px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                  {t('replay.viewProfile')}
                </Link>
              </div>

              {/* Description */}
              {vod.description && (
                <p className="mt-4 text-sm text-[var(--text-muted)] leading-relaxed">
                  {vod.description}
                </p>
              )}
            </div>
          </div>

          {/* Right: related replays */}
          <div className="xl:col-span-1">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sticky top-6">
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                {t('replay.moreFrom', { creator: displayName })}
              </h3>

              {related.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-6">
                  {t('replay.noOtherReplays')}
                </p>
              ) : (
                <div className="space-y-1">
                  {related.slice(0, 5).map((v) => (
                    <SidebarVODCard key={String(v._id)} vod={v} creatorId={resolvedCreatorId} />
                  ))}
                </div>
              )}

              <Link to={`/creator/${resolvedCreatorId}`}
                className="mt-4 flex w-full items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/5 transition-colors">
                {t('replay.allReplays')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
