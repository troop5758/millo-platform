import React from 'react';
import { SEO } from '../../components/SEO';
import { useOpsHealthSummary } from '../../hooks/useOpsHealth';
import StatusCard from '../../components/ops/StatusCard';

function labelBadgeClass(label) {
  if (label === 'LIVE') {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40';
  }
  if (label === 'PARTIAL') {
    return 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40';
  }
  return 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/40';
}

function OpsHealthContent() {
  const { data, loading, error } = useOpsHealthSummary();
  const services = data?.services || [];
  const overall = data?.status || 'unknown';
  const profile = data?.productionProfile;
  const profileRows = Array.isArray(profile?.rows) ? profile.rows : [];
  const guardRows = Array.isArray(profile?.guardRows) ? profile.guardRows : [];
  const showFeatureLabels = profileRows.some((r) => r.label != null);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">Ops Health</h1>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load ops health.'}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <StatusCard
              title="Overall Status"
              value={overall}
              subtitle={data?.updatedAt ? `Updated ${new Date(data.updatedAt).toLocaleString()}` : ''}
            />
            <StatusCard
              title="Services"
              value={Array.isArray(services) ? services.length : 0}
              subtitle="Reported components"
            />
            {profile?.ok ? (
              <StatusCard title="Profile env" value={profile.env || '—'} subtitle="config/production-profile.json" />
            ) : null}
          </div>

          <section className="mb-6" aria-labelledby="production-profile-heading">
            <h2 id="production-profile-heading" className="text-lg font-semibold text-[var(--text)] mb-2">
              Production profile
            </h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Source: <code className="text-xs bg-[var(--bg-card)] px-1 rounded">config/production-profile.json</code>
              {profile?.path ? (
                <span className="block mt-1 break-all text-xs opacity-80">Resolved: {profile.path}</span>
              ) : null}
            </p>
            {profile?.ok === false ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/25 text-amber-900 dark:text-amber-100 px-4 py-3 text-sm mb-3">
                Profile not loaded: {profile.error || 'unknown error'}
              </div>
            ) : null}
            {guardRows.length > 0 ? (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Guards</h3>
                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[var(--bg-card)] border-b border-[var(--border)] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-4 py-2 font-medium">Guard</th>
                        <th className="px-4 py-2 font-medium">Required</th>
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text)]">
                      {guardRows.map((row) => (
                        <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2 font-mono text-xs">{row.id}</td>
                          <td className="px-4 py-2">{row.required ? 'yes' : 'no'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {profileRows.length > 0 ? (
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Features</h3>
                <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[var(--bg-card)] border-b border-[var(--border)] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-4 py-2 font-medium">Feature</th>
                        <th className="px-4 py-2 font-medium">Enabled</th>
                        {showFeatureLabels ? <th className="px-4 py-2 font-medium">Label</th> : null}
                      </tr>
                    </thead>
                    <tbody className="text-[var(--text)]">
                      {profileRows.map((row) => (
                        <tr key={row.id} className="border-b border-[var(--border)] last:border-0">
                          <td className="px-4 py-2 font-mono text-xs">{row.id}</td>
                          <td className="px-4 py-2">{row.enabled ? 'yes' : 'no'}</td>
                          {showFeatureLabels ? (
                            <td className="px-4 py-2">
                              <span
                                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded border ${labelBadgeClass(row.label)}`}
                              >
                                {row.label}
                              </span>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : profile?.ok ? (
              <p className="text-sm text-[var(--text-muted)]">No feature rows in profile.</p>
            ) : null}
          </section>

          <pre className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-xs overflow-auto text-[var(--text)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}

export default function OpsHealthPage() {
  return (
    <>
      <SEO title="Ops health" path="/ops/health" />
      <OpsHealthContent />
    </>
  );
}
