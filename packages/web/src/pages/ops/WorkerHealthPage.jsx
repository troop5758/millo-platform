import React from 'react';
import { SEO } from '../../components/SEO';
import { useWorkerHealth } from '../../hooks/useOpsHealth';
import StatusCard from '../../components/ops/StatusCard';
function WorkerHealthContent() {
  const { data, loading, error } = useWorkerHealth();
  const workers = data?.workers || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">Worker Health</h1>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load worker health.'}
        </div>
      ) : null}

      {!loading && !error ? (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <StatusCard title="Queues / workers" value={Array.isArray(workers) ? workers.length : 0} />
          </div>

          <pre className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-xs overflow-auto text-[var(--text)]">
            {JSON.stringify(data, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}

export default function WorkerHealthPage() {
  return (
    <>
      <SEO title="Workers" path="/ops/workers" />
      <WorkerHealthContent />
    </>
  );
}
