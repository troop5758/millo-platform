import React from 'react';
import { SEO } from '../../components/SEO';
import { useDisputes } from '../../hooks/useDisputes';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { API_BASE } from '../../config/api';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function DisputesContent() {
  const { items, loading, error } = useDisputes({ limit: 50 }, { admin: false });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-2">Your disputes</h1>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Cases you opened on Millo. Staff review all disputes from{' '}
        <span className="text-[var(--text)] font-medium">/admin/disputes</span> (admins only).
      </p>
      <p className="text-sm text-[var(--text-muted)] mb-4">
        Refunds, billing, and chargeback timelines follow our{' '}
        <a
          href={`${API_BASE}/legal/payments-policy.html`}
          className="text-[var(--accent)] hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Payments &amp; refunds policy
        </a>{' '}
        (draft — counsel review). Payment disputes opened here are operational cases; they do not replace your card network or wallet provider dispute rights where applicable.
      </p>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load disputes.'}
        </div>
      ) : null}

      {!loading && !error && !items.length ? (
        <p className="text-[var(--text-muted)]">No disputes found.</p>
      ) : null}

      {!loading && !error && items.length ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm text-[var(--text)]">
            <thead>
              <tr className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Reason</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={item.id || item._id || index} className="border-b border-[var(--border)]">
                  <td className="p-3">{item.id || item._id || '—'}</td>
                  <td className="p-3">{item.status || 'unknown'}</td>
                  <td className="p-3">{item.reason || item.title || item.type || '—'}</td>
                  <td className="p-3">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <>
      <SEO title="Disputes" path="/disputes" />
      <ProtectedRoute>
        <DisputesContent />
      </ProtectedRoute>
    </>
  );
}
