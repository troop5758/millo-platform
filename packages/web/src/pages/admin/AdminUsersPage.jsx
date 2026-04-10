/**
 * AdminUsersPage — implicit route `/admin/users`
 * Simple admin user browser using GET /dashboards/admin/users.
 *
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useStaffAuth } from '../../context/StaffAuth';
import * as api from '../../sdk/dashboardsApi';
import { SEO } from '../../components/SEO';

export function AdminUsersPage() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminUsersContent />
    </ProtectedRoute>
  );
}

function AdminUsersContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.adminSearchUsers(staffUser, q, page, 25, role);
      setUsers(Array.isArray(res?.users) ? res.users : Array.isArray(res) ? res : []);
      setTotal(res?.total ?? 0);
    } catch (e) {
      setError(e.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [staffUser, q, page, role]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SEO title={t('admin.usersTitle', 'Admin Users')} path="/admin/users" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--staff-text)] mb-6">{t('admin.usersTitle', 'Admin Users')}</h1>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={t('admin.searchPlaceholder', 'Search email...')}
              className="staff-input"
              style={{ flex: '1 1 240px' }}
            />
            <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} className="staff-select">
              <option value="">{t('admin.allRoles', 'All roles')}</option>
              <option value="admin">admin</option>
              <option value="mod">mod</option>
              <option value="support">support</option>
            </select>
            <button type="button" className="staff-btn-primary" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : t('common.refresh', 'Refresh')}
            </button>
          </div>
          <div className="text-xs text-[var(--staff-text-muted)] mt-3">
            Total: {total}
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
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-[var(--staff-text-muted)]">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-[var(--staff-text-muted)]" colSpan={4}>
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u._id || u.id} className="border-t border-[var(--border)]">
                        <td className="px-4 py-3">
                          <div className="text-sm font-semibold text-[var(--staff-text)]">
                            {u.displayName || u.email || '—'}
                          </div>
                          <div className="text-xs text-[var(--staff-text-muted)]">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--staff-text)]">{u.role || u.creatorStatus || '—'}</td>
                        <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">{u.status || '—'}</td>
                        <td className="px-4 py-3 text-sm text-[var(--staff-text-muted)]">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

