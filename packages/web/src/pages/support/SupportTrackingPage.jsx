/**
 * SupportTrackingPage — public tracking by tracking id.
 * Route: /support/tracking/:trackingNumber
 *
 * Backend:
 *  - GET /ticket/:trackingId (public safe fields)
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { API_BASE } from '../../config/api';

export function SupportTrackingPage() {
  const { t } = useTranslation();
  const { trackingNumber } = useParams();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!trackingNumber) {
        if (!mounted) return;
        setError('Tracking ID required');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/ticket/${encodeURIComponent(trackingNumber)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || data?.message || 'Ticket not found');
        if (!mounted) return;
        setTicket(data);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || 'Failed to load ticket');
        setTicket(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [trackingNumber]);

  return (
    <>
      <SEO title={t('support.trackTitle', 'Track support ticket')} path={`/support/tracking/${trackingNumber || ''}`} />
      <div className="p-6 max-w-xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text)]">{t('support.trackHeader', 'Track support ticket')}</h1>
          <Link to="/support/request" className="text-sm text-[var(--accent)] hover:underline">
            {t('support.openNew', 'Open a new ticket')}
          </Link>
        </div>

        {loading && (
          <div className="py-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="mb-4 rounded-lg bg-[var(--error)]/10 text-[var(--error)] px-3 py-2 text-sm border border-[var(--error)]/20">
            {error}
          </div>
        )}

        {!loading && ticket && !error && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-2">
            <div className="text-xs text-[var(--text-muted)]">
              {t('support.trackingId', 'Tracking ID')}: <span className="font-mono">{ticket.trackingId || ticket.ticketNumber || trackingNumber}</span>
            </div>
            {ticket.subject ? (
              <h3 className="text-base font-semibold text-[var(--text)]">{ticket.subject}</h3>
            ) : null}
            <p className="text-sm text-[var(--text)]">
              {t('support.status', 'Status')}: <span className="font-medium">{ticket.status || '—'}</span>
            </p>
            {ticket.sla?.responseDue || ticket.sla?.resolutionDue ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t('support.slaTargets', 'SLA targets')}:&nbsp;
                {ticket.sla?.responseDue ? new Date(ticket.sla.responseDue).toLocaleString() : '—'}
                &nbsp;·&nbsp;
                {ticket.sla?.resolutionDue ? new Date(ticket.sla.resolutionDue).toLocaleString() : '—'}
              </p>
            ) : null}
            {ticket.createdAt ? (
              <p className="text-xs text-[var(--text-muted)]">
                {t('support.created', 'Created')}: {new Date(ticket.createdAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

