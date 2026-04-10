/**
 * AdminAuditPage — implicit route `/admin/audit`
 * Displays compliance audit logs (GET /dashboards/admin/audit-logs).
 *
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useStaffAuth } from '../../context/StaffAuth';
import { SEO } from '../../components/SEO';
import * as api from '../../sdk/dashboardsApi';

function formatDate(d) {
  try { return d ? new Date(d).toLocaleString() : '—'; } catch { return '—'; }
}

export function AdminAuditPage() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminAuditContent />
    </ProtectedRoute>
  );
}

function AdminAuditContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);

  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.adminGetAuditLogs(staffUser, { limit, offset, action: action || undefined });
      setLogs(Array.isArray(res?.logs) ? res.logs : Array.isArray(res) ? res : []);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [staffUser, action, offset, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <SEO title={t('admin.auditTitle', 'Audit Logs')} path="/admin/audit" />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-[var(--staff-text)]">{t('admin.auditTitle', 'Audit Logs')}</h1>
          <div className="flex items-center gap-3">
            <input
              value={action}
              onChange={(e) => { setAction(e.target.value); setOffset(0); }}
              placeholder="action filter (optional)"
              className="staff-input"
              style={{ width: 260 }}
            />
            <button type="button" className="staff-btn-primary" onClick={() => { setOffset(0); load(); }} disabled={loading}>
              {loading ? 'Loading…' : t('common.refresh', 'Refresh')}
            </button>
          </div>
        </div>

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
          <>
            <div className="text-xs text-[var(--staff-text-muted)] mb-3">Total: {total}</div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs text-[var(--staff-text-muted)]">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Admin</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-sm text-[var(--staff-text-muted)]">
                          No logs found.
                        </td>
                      </tr>
                    ) : (
                      logs.map((l) => (
                        <tr key={l._id || l.id} className="border-t border-[var(--border)]">
                          <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">{formatDate(l.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-[var(--staff-text)]">{l.adminId?.email || l.adminEmail || '—'}</td>
                          <td className="px-4 py-3 text-sm">{l.action || '—'}</td>
                          <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">
                            {l.targetType || '—'} · {l.targetId ? String(l.targetId).slice(-10) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--staff-text-muted)] max-w-[420px]">
                            {l.meta ? JSON.stringify(l.meta) : ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 mt-5">
              <button
                type="button"
                className="staff-btn-secondary"
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                disabled={offset <= 0}
              >
                Prev
              </button>
              <div className="text-xs text-[var(--staff-text-muted)]">Offset {offset}</div>
              <button
                type="button"
                className="staff-btn-secondary"
                onClick={() => setOffset((o) => o + limit)}
                disabled={logs.length < limit}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

