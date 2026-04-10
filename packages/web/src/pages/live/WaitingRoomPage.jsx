import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { Countdown } from '../../components/Countdown';
import { fetchStream } from '../../sdk/contentApi';

function getCountdownStart(stream) {
  // For scheduled streams, the backend schema uses `startedAt` as the schedule time.
  // We fall back defensively to tolerate missing/nullable fields.
  return stream?.startedAt ?? stream?.meta?.startedAt ?? null;
}

export function WaitingRoomPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const streamId = id ? String(id) : '';
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!streamId) {
      setError(t('waitingRoom.noStreamId', { defaultValue: 'Missing stream id' }));
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const s = await fetchStream(streamId);
        if (!alive) return;
        setStream(s);
        setError(null);
      } catch (e) {
        if (!alive) return;
        setError(t('waitingRoom.notFound', { defaultValue: 'Stream not found' }));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [streamId, t]);

  useEffect(() => {
    if (!stream) return;
    if (stream.status === 'live') {
      navigate(`/live/${streamId}`, { replace: true });
    }
  }, [stream, streamId, navigate]);

  const countdownStart = useMemo(() => getCountdownStart(stream), [stream]);
  const isEnded = stream?.status === 'ended';

  return (
    <>
      <SEO
        title={t('waitingRoom.title', { defaultValue: 'Waiting Room' })}
        description={t('waitingRoom.subtitle', { defaultValue: 'Starting soon' })}
        path={`/live/waiting-room/${streamId}`}
      />
      <div className="max-w-2xl mx-auto px-4 py-10">
        {loading ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 animate-pulse">
            <div className="h-5 bg-[var(--bg-elevated)] rounded w-2/3 mb-4" />
            <div className="h-3 bg-[var(--bg-elevated)] rounded w-1/2" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-red-200">
            <p className="font-semibold">{error}</p>
          </div>
        ) : isEnded ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">{t('waitingRoom.ended', { defaultValue: 'This stream has ended.' })}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <span className="text-amber-500 font-bold">LIVE</span>
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-[var(--text)] truncate">
                  {stream?.title || t('waitingRoom.streamTitle', { defaultValue: 'Stream' })}
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {t('waitingRoom.startingSoon', { defaultValue: 'Starting soon. Please wait.' })}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {countdownStart ? (
                <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3">
                  <Countdown startTime={countdownStart} className="text-sm font-semibold text-[var(--accent)]" />
                </div>
              ) : (
                <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] px-4 py-3 text-sm font-semibold text-[var(--text)]">
                  {t('waitingRoom.loadingCountdown', { defaultValue: 'Preparing stream...' })}
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate(`/live/${streamId}`)}
                className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--bg-elevated)] transition-colors text-sm font-semibold text-[var(--text)]"
              >
                {t('waitingRoom.openPlayer', { defaultValue: 'Open Player' })}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

