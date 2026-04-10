import React from 'react';

export default function StatusCard({ title, value, subtitle }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 min-w-[220px]">
      <div className="text-sm text-[var(--text-muted)] mb-2">{title}</div>
      <div className="text-2xl font-bold text-[var(--text)] mb-1">{value}</div>
      {subtitle ? <div className="text-xs text-[var(--text-muted)]">{subtitle}</div> : null}
    </div>
  );
}
