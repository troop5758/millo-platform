import React from 'react';

/**
 * @param {{ label?: string, className?: string }} props
 */
export function ComingSoon({ label = 'Coming soon', className = '' }) {
  return (
    <div
      className={
        'rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-muted)] text-center ' +
        className
      }
      role="status"
    >
      {label}
    </div>
  );
}
