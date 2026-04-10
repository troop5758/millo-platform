/**
 * AdminModerationPage — implicit route `/admin/moderation`
 * Loads moderation dashboards/panels via dashboardsApi.
 *
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useStaffAuth } from '../../context/StaffAuth';
import { SEO } from '../../components/SEO';
import TrustBadge from '../../components/TrustBadge';
import * as api from '../../sdk/dashboardsApi';

function renderJson(obj) {
  return (
    <pre className="text-xs whitespace-pre-wrap break-words text-[var(--staff-text-muted)]">
      {JSON.stringify(obj, null, 2)}
    </pre>
  );
}

export function AdminModerationPage() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminModerationContent />
    </ProtectedRoute>
  );
}

function AdminModerationContent() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dashboard, setDashboard] = useState(null);
  const [authenticity, setAuthenticity] = useState(null);
  const [trend, setTrend] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, a, tr] = await Promise.all([
        api.adminGetModerationDashboard(staffUser, { days }),
        api.adminGetContentAuthenticityPanel(staffUser, { days }),
        api.adminGetTrendMonitoringPanel(staffUser, { days }),
      ]);
      setDashboard(d || null);
      setAuthenticity(a || null);
      setTrend(tr || null);
    } catch (e) {
      setError(e.message || 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  }, [staffUser, days]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <SEO title={t('admin.moderationTitle', 'Moderation')} path="/admin/moderation" />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <h1 className="text-2xl font-bold text-[var(--staff-text)]">{t('admin.moderationTitle', 'Moderation')}</h1>
          <div className="flex items-center gap-3">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="staff-select">
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
            </select>
            <button type="button" className="staff-btn-primary" onClick={load} disabled={loading}>
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
          <div className="space-y-5">
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h2 className="text-lg font-semibold text-[var(--staff-text)] mb-3">Moderation dashboard</h2>
              {dashboard ? renderJson(dashboard) : <div className="text-sm text-[var(--staff-text-muted)]">—</div>}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h2 className="text-lg font-semibold text-[var(--staff-text)] mb-3">Content authenticity</h2>
              {authenticity ? renderJson(authenticity) : <div className="text-sm text-[var(--staff-text-muted)]">—</div>}
            </section>

            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <h2 className="text-lg font-semibold text-[var(--staff-text)] mb-3">Trend monitoring</h2>
              {trend ? renderJson(trend) : <div className="text-sm text-[var(--staff-text-muted)]">—</div>}
            </section>
          </div>
        )}
      </div>
    </>
  );
}

