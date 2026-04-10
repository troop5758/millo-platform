import React from 'react';
import { SEO } from '../../components/SEO';
import { useActivityFeed } from '../../hooks/useActivityFeed';
import ActivityList from '../../components/activity/ActivityList';
import { ProtectedRoute } from '../../components/ProtectedRoute';

function ActivityFeedContent() {
  const { items, loading, error } = useActivityFeed({ limit: 50 });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-4">Activity Feed</h1>

      {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
          {error.message || 'Failed to load activity feed.'}
        </div>
      ) : null}

      {!loading && !error ? <ActivityList items={items} /> : null}
    </div>
  );
}

export default function ActivityFeedPage() {
  return (
    <>
      <SEO title="Activity" path="/activity" />
      <ProtectedRoute>
        <ActivityFeedContent />
      </ProtectedRoute>
    </>
  );
}
