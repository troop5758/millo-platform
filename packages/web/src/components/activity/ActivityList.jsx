import React from 'react';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function ActivityList({ items = [] }) {
  if (!items.length) {
    return <div className="text-[var(--text-muted)] py-6">No recent activity.</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item.id || item._id || `${item.userId || 'u'}-${index}`}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
        >
          <div className="font-semibold text-[var(--text)] mb-1">
            {item.actor?.displayName || item.actorName || item.actor?.name || 'User'}
          </div>
          <div className="text-sm text-[var(--text)] mb-2">
            {item.message ||
              item.text ||
              item.description ||
              (item.action ? `${item.action}${item.resourceType ? ` · ${item.resourceType}` : ''}` : 'Activity')}
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {formatDate(item.createdAt || item.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}
