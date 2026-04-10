/**
 * Admin Metrics — System health, metrics, worker stats, recommendations.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import { ProtectedRoute } from '../components/ProtectedRoute';
import * as api from '../sdk/dashboardsApi';
import { IconBack } from '../components/StaffIcons';
import { useStaffAuth } from '../context/StaffAuth';
import { OperationalStubBanner } from '../components/OperationalStubBanner';

function AdminMetricsContent() {
  const { staffUser } = useStaffAuth();
  const [tab, setTab] = useState('health');
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [rootHealth, setRootHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, h, rec, root] = await Promise.all([
        api.adminGetWorkerMetrics().catch(() => ({ jobs_processed: 0, failures: 0, queues: [] })),
        staffUser ? api.adminGetObservationHealth(staffUser).catch(() => null) : null,
        staffUser ? api.adminGetObservationRecommendations(staffUser).catch(() => ({ recommendations: [] })) : { recommendations: [] },
        api.adminGetRootHealth().catch(() => null),
      ]);
      setMetrics(m);
      setHealth(h);
      setRecommendations(rec);
      setRootHealth(root);
    } catch (e) {
      setError(e.message || 'Failed to load');
    }
    setLoading(false);
  }, [staffUser]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SEO title="System Health & Metrics" description="Millo admin — system health, metrics, worker stats." path="/admin/metrics" />
      <div className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">System Health & Metrics</h1>
          <Link to="/admin" className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-colors" aria-label="Back to admin">
            <IconBack className="w-5 h-5" />
          </Link>
        </header>
        <main className="p-6 max-w-4xl">
          <OperationalStubBanner variant="admin" className="mb-6" />
          {loading && (
            <div className="flex items-center gap-2 text-slate-500">
              <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && (
            <>
              <div className="flex gap-2 mb-6">
                {['health', 'metrics', 'recommendations'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${tab === t ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === 'health' && (
                <div className="space-y-6">
                  <div className="rounded-xl bg-white border border-slate-200 p-6">
                    <h2 className="font-semibold text-slate-700 mb-4">Root Health (Public)</h2>
                    {rootHealth ? (
                      <pre className="text-sm bg-slate-50 p-4 rounded-lg overflow-x-auto">{JSON.stringify(rootHealth, null, 2)}</pre>
                    ) : (
                      <p className="text-slate-500 text-sm">Unable to fetch /health</p>
                    )}
                  </div>
                  {health && (
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <h2 className="font-semibold text-slate-700 mb-4">Observation Health</h2>
                      <pre className="text-sm bg-slate-50 p-4 rounded-lg overflow-x-auto">{JSON.stringify(health, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}

              {tab === 'metrics' && metrics && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Jobs Processed</p>
                      <p className="mt-1 text-3xl font-bold text-slate-800">{metrics.jobs_processed ?? 0}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-6">
                      <p className="text-sm font-medium text-slate-500 uppercase tracking-wide">Failures</p>
                      <p className="mt-1 text-3xl font-bold text-slate-800">{metrics.failures ?? 0}</p>
                    </div>
                  </div>
                  {metrics.queues?.length > 0 && (
                    <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
                      <h2 className="px-6 py-4 font-semibold text-slate-700 border-b border-slate-200">Queue Details</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50">
                              <th className="text-left py-3 px-6 font-medium text-slate-600">Queue</th>
                              <th className="text-right py-3 px-6 font-medium text-slate-600">Waiting</th>
                              <th className="text-right py-3 px-6 font-medium text-slate-600">Active</th>
                              <th className="text-right py-3 px-6 font-medium text-slate-600">Completed</th>
                              <th className="text-right py-3 px-6 font-medium text-slate-600">Failed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {metrics.queues.map((q) => (
                              <tr key={q.name} className="border-b border-slate-100">
                                <td className="py-3 px-6 font-mono">{q.name}</td>
                                <td className="text-right py-3 px-6">{q.waiting ?? q.wait ?? '-'}</td>
                                <td className="text-right py-3 px-6">{q.active ?? '-'}</td>
                                <td className="text-right py-3 px-6">{q.completed ?? '-'}</td>
                                <td className="text-right py-3 px-6">{q.failed ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'recommendations' && recommendations && (
                <div className="rounded-xl bg-white border border-slate-200 p-6">
                  <h2 className="font-semibold text-slate-700 mb-4">Upgrade Recommendations</h2>
                  {(recommendations.recommendations || []).length > 0 ? (
                    <ul className="space-y-2">
                      {(recommendations.recommendations || []).map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-amber-500 shrink-0">•</span>
                          <span className="text-slate-700">{typeof r === 'string' ? r : (r.message || r.title || JSON.stringify(r))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm">No recommendations at this time.</p>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

export default function AdminMetrics() {
  return (
    <ProtectedRoute requireRole="admin">
      <AdminMetricsContent />
    </ProtectedRoute>
  );
}
