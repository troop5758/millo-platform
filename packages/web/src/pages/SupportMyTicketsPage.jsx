/**
 * My support tickets — list user's tickets (GET /support/my). Auth required.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { API_BASE } from '../config/api';

function getToken() {
  try {
    return localStorage.getItem('millo_token') || '';
  } catch {
    return '';
  }
}

const STATUS_LABELS = { OPEN: 'Open', IN_REVIEW: 'In review', RESOLVED: 'Resolved', REJECTED: 'Rejected' };
const TRACKING_LABELS = { PENDING: 'Pending', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered', FAILED: 'Failed' };

function SupportMyContent() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`${API_BASE}/support/my`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setTickets(data.tickets || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <SEO title={t('support.myTickets') || 'My support tickets'} path="/support/my" />
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-[var(--text)]">
            {t('support.myTickets') || 'My support tickets'}
          </h1>
          <Link
            to="/support/request"
            className="text-[var(--accent)] hover:underline font-medium"
          >
            {t('support.reportIssue') || 'Report an issue'}
          </Link>
        </div>

        {loading && <p className="text-[var(--text-muted)]">{t('common.loading') || 'Loading…'}</p>}
        {error && (
          <div className="rounded-lg bg-[var(--error)]/15 text-[var(--error)] p-3 text-sm">
            {error}
          </div>
        )}
        {!loading && !error && tickets.length === 0 && (
          <p className="text-[var(--text-muted)]">
            {t('support.noTickets') || 'No tickets yet.'}{' '}
            <Link to="/support/request" className="text-[var(--accent)] hover:underline">
              {t('support.reportIssue') || 'Report an issue'}
            </Link>
          </p>
        )}
        {!loading && tickets.length > 0 && (
          <ul className="space-y-3">
            {tickets.map((t) => (
              <li key={t._id} className="rounded-xl border border-[var(--border)] p-4 bg-[var(--bg)]">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-[var(--text)]">
                    {STATUS_LABELS[t.status] || t.status} · {TRACKING_LABELS[t.trackingStatus] || t.trackingStatus}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {t.issueType?.replace('_', ' ')}
                  </span>
                </div>
                {t.orderId && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">Order: {String(t.orderId).slice(-8)}</p>
                )}
                {t.description && (
                  <p className="text-sm text-[var(--text)] mt-1 line-clamp-2">{t.description}</p>
                )}
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export function SupportMyTicketsPage() {
  return (
    <ProtectedRoute>
      <SupportMyContent />
    </ProtectedRoute>
  );
}
