import React from 'react';
import { SEO } from '../../components/SEO';
import { useQueueStats } from '../../hooks/useOpsHealth';
import StatusCard from '../../components/ops/StatusCard';
function QueueDashboardContent() {
  const { data, loading, error } = useQueueStats();
  const queues = data?.queues || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">Queue Dashboard</h1>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load queue stats.'}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <StatusCard title="Queues" value={Array.isArray(queues) ? queues.length : 0} />
          </div>

          <pre className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-xs overflow-auto text-[var(--text)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}

export default function QueueDashboardPage() {
  return (
    <>
      <SEO title="Queues" path="/ops/queues" />
      <QueueDashboardContent />
    </>
  );
}
