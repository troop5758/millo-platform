/**
 * UpcomingStreamsPage — list of scheduled streams with countdown.
 * Route: /live/upcoming
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { Countdown } from '../components/Countdown';
import { IconUser, IconVideo } from '../components/Icons';

function IconClock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
import { fetchUpcomingScheduled, getScheduledStreamCalendarUrl } from '../sdk/contentApi';

export function UpcomingStreamsPage() {
  const { t } = useTranslation();
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUpcomingScheduled()
      .then(setStreams)
      .catch(() => setStreams([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <SEO title={t('upcomingStreams.title')} description={t('upcomingStreams.subtitle')} path="/live/upcoming" />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <IconClock className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('upcomingStreams.title')}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t('upcomingStreams.subtitle')}</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 animate-pulse">
                <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/3 mb-4" />
                <div className="h-3 bg-[var(--bg-elevated)] rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
            <IconVideo className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
            <p className="text-[var(--text-muted)] font-medium">{t('upcomingStreams.noStreams')}</p>
            <Link to="/schedule-stream" className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
              {t('upcomingStreams.scheduleOne')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {streams.map((s) => (
              <div
                key={String(s._id)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-[var(--text)] truncate">{s.title || t('upcomingStreams.untitled')}</h2>
                  {s.description && (
                    <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-sm text-[var(--text-muted)]">
                    <IconUser className="w-4 h-4 shrink-0" />
                    <span>{s.creatorId?.displayName || t('upcomingStreams.creator')}</span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <IconClock className="w-4 h-4 text-amber-500" />
                  <Countdown startTime={s.scheduledStart} className="text-sm font-semibold text-amber-600 dark:text-amber-400" />
                </div>
                <a
                  href={getScheduledStreamCalendarUrl(s._id, 'google')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors text-center"
                >
                  {t('upcomingStreams.addToCalendar')}
                </a>
              </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center">
          <Link to="/live" className="text-sm text-[var(--accent)] hover:underline">
            {t('upcomingStreams.viewLive')}
          </Link>
        </p>
      </div>
    </>
  );
}
