/**
 * EventCountdownPage — countdown to a scheduled live event.
 * Route: /live/events/:eventId
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { Countdown } from '../components/Countdown';
import { IconUser, IconVideo } from '../components/Icons';
import { fetchEvent } from '../sdk/contentApi';

function IconClock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function EventCountdownPage() {
  const { eventId } = useParams();
  const { t } = useTranslation();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      setError('EVENT_NOT_FOUND');
      return;
    }
    setLoading(true);
    setError(null);
    fetchEvent(eventId)
      .then(setEvent)
      .catch((err) => {
        setEvent(null);
        setError(err?.message || 'EVENT_NOT_FOUND');
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 animate-pulse">
          <div className="h-6 bg-[var(--bg-elevated)] rounded w-2/3 mb-4" />
          <div className="h-4 bg-[var(--bg-elevated)] rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
          <IconVideo className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
          <p className="text-[var(--text-muted)] font-medium">{t('eventCountdown.notFound')}</p>
          <Link to="/live" className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
            {t('eventCountdown.viewLive')}
          </Link>
        </div>
      </div>
    );
  }

  const startTime = event.scheduledStart || event.scheduled_start;
  const isPast = startTime && new Date(startTime) <= new Date();

  return (
    <>
      <SEO title={event.title || t('eventCountdown.title')} description={event.description} path={`/live/events/${eventId}`} />
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 sm:p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
            <IconClock className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)] mb-2">
            {event.title || t('eventCountdown.untitled')}
          </h1>
          {event.creatorId?.displayName && (
            <div className="flex items-center justify-center gap-2 text-sm text-[var(--text-muted)] mb-6">
              <IconUser className="w-4 h-4 shrink-0" />
              <span>{event.creatorId.displayName}</span>
            </div>
          )}
          {event.description && (
            <p className="text-[var(--text-muted)] text-sm sm:text-base mb-8 line-clamp-3">{event.description}</p>
          )}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-6 py-4 inline-block">
            <h2 className="text-lg font-semibold text-amber-600 dark:text-amber-400">
              {isPast ? (
                t('countdown.startingSoon')
              ) : (
                <Countdown startTime={startTime} className="text-amber-600 dark:text-amber-400" compact={false} />
              )}
            </h2>
          </div>
        </div>
        <p className="mt-8 text-center">
          <Link to="/live" className="text-sm text-[var(--accent)] hover:underline">
            {t('eventCountdown.viewLive')}
          </Link>
        </p>
      </div>
    </>
  );
}
