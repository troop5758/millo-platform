/**
 * AdminPayoutsPage — implicit route `/admin/payouts`
 * Loads payout requests (admin) via dashboardsApi.
 *
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useStaffAuth } from '../../context/StaffAuth';
import { SEO } from '../../components/SEO';
import { OperationalStubBanner } from '../../components/OperationalStubBanner';
import * as api from '../../sdk/dashboardsApi';

export function AdminPayoutsPage() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminPayoutsContent />
    </ProtectedRoute>
  );
}

function fmtCents(c) {
  if (c == null || Number.isNaN(Number(c))) return '$0.00';
  return '$' + (Number(c) / 100).toFixed(2);
}

function AdminPayoutsContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [payouts, setPayouts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.adminGetPayouts(status, page, 25);
      setPayouts(Array.isArray(res?.payouts) ? res.payouts : Array.isArray(res) ? res : []);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e.message || 'Failed to load payouts');
    } finally {
      setLoading(false);
    }
  }, [staffUser, status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <SEO title={t('admin.payoutsTitle', 'Payouts')} path="/admin/payouts" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-[var(--staff-text)]">{t('admin.payoutsTitle', 'Payouts')}</h1>
          <div className="flex items-center gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="staff-select">
              <option value="pending">pending</option>
              <option value="processing">processing</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
            <button type="button" className="staff-btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : t('common.refresh', 'Refresh')}
            </button>
          </div>
        </div>

        <OperationalStubBanner variant="admin" features={['payouts', 'payments', 'kyc']} className="mb-4" />

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--staff-error)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            <div className="text-xs text-[var(--staff-text-muted)] mb-3">Total: {total}</div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-[var(--staff-text-muted)]">
                      <th className="px-4 py-3">Payout</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-sm text-[var(--staff-text-muted)]" colSpan={4}>
                          No payouts found.
                        </td>
                      </tr>
                    ) : (
                      payouts.map((p) => (
                        <tr key={p._id || p.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-3 text-sm font-semibold text-[var(--staff-text)]">{p._id ? String(p._id).slice(-10) : p.id || '—'}</td>
                          <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">{p.status || '—'}</td>
                          <td className="px-4 py-3 text-sm text-[var(--staff-text)] font-bold">{fmtCents(p.amountCents ?? p.amount)}</td>
                          <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 mt-5">
              <button type="button" className="staff-btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </button>
              <div className="text-xs text-[var(--staff-text-muted)]">Page {page}</div>
              <button type="button" className="staff-btn-secondary" onClick={() => setPage((p) => p + 1)} disabled={payouts.length < 25}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

