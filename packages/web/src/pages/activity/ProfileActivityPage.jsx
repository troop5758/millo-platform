import React from 'react';
import { useParams } from 'react-router-dom';
import { SEO } from '../../components/SEO';
import { useProfileActivity } from '../../hooks/useProfileActivity';
import ActivityList from '../../components/activity/ActivityList';

export default function ProfileActivityPage() {
  const { userId } = useParams();
  const { items, loading, error } = useProfileActivity(userId, { limit: 50 });

  return (
    <>
      <SEO title="Profile activity" path={`/profile/${userId}/activity`} />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-[var(--text)] mt-0 mb-2">Profile Activity</h1>
        <p className="text-sm text-[var(--text-muted)] mb-4">User: {userId}</p>

        {loading ? <p className="text-[var(--text-muted)]">Loading…</p> : null}

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 text-sm">
            {error.message || 'Failed to load profile activity.'}
          </div>
        ) : null}

        {!loading && !error ? <ActivityList items={items} /> : null}
      </div>
    </>
  );
}
