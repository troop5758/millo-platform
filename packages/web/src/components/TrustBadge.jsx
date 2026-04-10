/**
 * Honest deployment status — explicit `status` (PATCH 12) or Production Truth via `feature` + GET /health.
 * https://milloapp.com
 */
import React from 'react';
import { useFeatureStatus } from '../trust/TrustStatusContext.jsx';

const base =
  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums';

/**
 * @param {{
 *   feature?: string,
 *   status?: 'LIVE' | 'BETA' | 'DISABLED',
 *   className?: string,
 * }} props
 * When `status` is LIVE | BETA | DISABLED, it wins over `feature` / context (no loading state).
 */
export default function TrustBadge({ feature, status: explicitStatus, className = '' }) {
  const ctxStatus = useFeatureStatus(feature ?? '');

  const status =
    explicitStatus === 'LIVE' || explicitStatus === 'BETA' || explicitStatus === 'DISABLED'
      ? explicitStatus
      : feature
        ? ctxStatus
        : 'UNKNOWN';

  if (status === 'LOADING') {
    return (
      <span className={`${base} bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)] ${className}`}>
        …
      </span>
    );
  }
  if (status === 'ERROR' || status === 'UNKNOWN') {
    return (
      <span className={`${base} bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25 ${className}`}>
        Unknown
      </span>
    );
  }
  if (status === 'LIVE') {
    return (
      <span className={`${base} text-green-500 ${className}`}>
        Verified
      </span>
    );
  }
  if (status === 'BETA') {
    return (
      <span className={`${base} text-yellow-500 ${className}`}>
        Limited
      </span>
    );
  }
  return (
    <span className={`${base} text-red-500 ${className}`}>
      Not Active
    </span>
  );
}

/**
 * Label + badge row for settings / admin tables.
 */
export function TrustLabeledBadge({ label, feature }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-b-0">
      <span className="text-sm text-[var(--text)]">{label}</span>
      <TrustBadge feature={feature} />
    </div>
  );
}
