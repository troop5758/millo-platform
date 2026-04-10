/**
 * VODPage — browse and watch recorded stream replays.
 * Fetches from GET /content/vod
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { VideoPlayer } from '../components/VideoPlayer';
import { fetchVODs, fetchVOD } from '../sdk/contentApi';

function fmt(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(date, t) {
  if (!date) return '';
  const days = Math.floor((Date.now() - new Date(date)) / 86400000);
  if (days === 0) return t('vod.today');
  if (days === 1) return t('vod.yesterday');
  if (days < 7)   return t('vod.daysAgo',   { count: days });
  if (days < 30)  return t('vod.weeksAgo',  { count: Math.floor(days / 7) });
  return t('vod.monthsAgo', { count: Math.floor(days / 30) });
}

function VODCard({ vod, onPlay, t }) {
  const creator = vod.creator || {};
  const dur     = fmt(vod.recordingDuration);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={() => onPlay(vod)}>
      <div className="relative aspect-video bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
        {vod.thumbnailUrl
          ? <img src={vod.thumbnailUrl} alt={vod.title} className="absolute inset-0 w-full h-full object-cover" />
          : <svg className="w-10 h-10 text-[var(--text-muted)] opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
        }
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-semibold">
          {t('vod.replay')}
        </span>
        {dur && (
          <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-white text-xs font-mono">
            {dur}
          </span>
        )}
      </div>
      <div className="p-3.5 flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 shrink-0 flex items-center justify-center overflow-hidden">
          {creator.avatarUrl
            ? <img src={creator.avatarUrl} alt={creator.displayName} className="w-full h-full object-cover" />
            : <span className="text-sm font-bold text-[var(--accent)]">
                {(creator.displayName || 'C')[0].toUpperCase()}
              </span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)] text-sm truncate">{vod.title || t('vod.replay')}</p>
          <p className="text-xs text-[var(--text-muted)]">{creator.displayName} · {timeAgo(vod.endedAt, t)}</p>
        </div>
      </div>
    </div>
  );
}

export function VODPage() {
  const { t }  = useTranslation();
  const [searchParams] = useSearchParams();
  const vodId = searchParams.get('id');
  const [vods,      setVods]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [playing,   setPlaying]   = useState(null);
  const [vodError,  setVodError]  = useState(false);
  const [offset,    setOffset]    = useState(0);
  const [hasMore,   setHasMore]   = useState(true);

  // If direct VOD link (?id=), load it immediately
  useEffect(() => {
    if (!vodId) return;
    setVodError(false);
    fetchVOD(vodId).then(setPlaying).catch(() => setVodError(true));
  }, [vodId]);

  const load = (reset = false) => {
    const off = reset ? 0 : offset;
    if (reset) setError(false);
    setLoading(true);
    fetchVODs({ limit: 20, offset: off })
      .then((data) => {
        const list = data.vods || [];
        setVods((prev) => reset ? list : [...prev, ...list]);
        setOffset(off + list.length);
        setHasMore(list.length >= 20);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(true); }, []);

  return (
    <>
      <SEO title={t('vod.seoTitle')} description={t('vod.seoDesc')} path="/vod" />

      {/* Playing modal */}
      {playing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-4xl rounded-2xl overflow-hidden bg-[var(--bg)] border border-[var(--border)] shadow-2xl">
            <VideoPlayer
              src={playing.recordingUrl}
              poster={playing.thumbnailUrl}
              live={false}
              autoPlay
              className="rounded-none rounded-t-2xl"
            />
            <div className="p-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-[var(--text)] text-base">{playing.title || t('vod.replay')}</h2>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  {playing.creator?.displayName}
                  {playing.recordingDuration ? ` · ${fmt(playing.recordingDuration)}` : ''}
                  {playing.endedAt ? ` · ${timeAgo(playing.endedAt, t)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setPlaying(null)}
                className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                {t('vod.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('vod.title')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">{t('vod.subtitle')}</p>
          </div>
        </div>

        {/* Direct VOD link failed to load */}
        {vodError && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('vod.errorVod')}
          </div>
        )}

        {/* Page-level load error */}
        {error && vods.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-medium text-[var(--text)]">{t('vod.errorLoad')}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('vod.errorLoadDesc')}</p>
            <button type="button" onClick={() => load(true)}
              className="mt-4 px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
              {t('common.retry')}
            </button>
          </div>
        ) : loading && vods.length === 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden animate-pulse">
                <div className="aspect-video bg-[var(--bg-elevated)]" />
                <div className="p-3.5 flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-[var(--bg-elevated)] rounded w-3/4" />
                    <div className="h-2.5 bg-[var(--bg-elevated)] rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : vods.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-[var(--text-muted)] font-medium">{t('vod.noReplays')}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('vod.noReplaysDesc')}</p>
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {vods.map((v) => (
                <VODCard key={String(v._id)} vod={v} onPlay={setPlaying} t={t} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button type="button" onClick={() => load(false)} disabled={loading}
                  className="px-6 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50">
                  {loading ? t('vod.loading') : t('vod.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
