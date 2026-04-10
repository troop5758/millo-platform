/**
 * VideoPage — Video detail / replay viewer.
 * Route: /video/:id
 *
 * Backend:
 *  - GET /content/vod/:id
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { VideoPlayer } from '../../components/VideoPlayer';
import { fetchVOD } from '../../sdk/contentApi';

export function VideoPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [vod, setVod] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      setError('');
      try {
        if (!id) throw new Error('Missing video id');
        const data = await fetchVOD(id);
        if (!mounted) return;
        setVod(data || null);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || t('vod.errorLoad', 'Failed to load video'));
        setVod(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [id, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !vod) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-4">
        <div className="text-5xl">🎥</div>
        <h1 className="text-xl font-semibold text-[var(--text)]">{t('vod.errorLoadTitle', 'Video unavailable')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{error || t('vod.errorLoadDesc', 'This video could not be loaded.')}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            {t('common.back', 'Back')}
          </button>
          <Link
            to="/vod"
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
          >
            {t('vod.browseReplays', 'Browse replays')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={vod.title || t('vod.replay', 'Replay')}
        description={vod.creator?.displayName || ''}
        path={`/video/${id}`}
        image={vod.thumbnailUrl || undefined}
      />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-[var(--accent)] hover:underline font-medium"
          >
            {t('common.back', 'Back')}
          </button>
          <Link to="/vod" className="text-sm text-[var(--accent)] hover:underline font-medium">
            {t('vod.backToVOD', 'Back to replays')}
          </Link>
        </div>

        <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
          <VideoPlayer
            src={vod.recordingUrl}
            poster={vod.thumbnailUrl}
            live={false}
            autoPlay
            className="rounded-none"
            showChat={false}
          />
          <div className="p-4">
            <h1 className="text-xl font-bold text-[var(--text)]">{vod.title || t('vod.replay', 'Replay')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {vod.creator?.displayName ? `${vod.creator.displayName} · ` : ''}
              {vod.endedAt ? new Date(vod.endedAt).toLocaleDateString() : ''}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

