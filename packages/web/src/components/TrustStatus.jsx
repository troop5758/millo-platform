/**
 * Mandatory trust / safety disclosure — bind to Trust Enforcement Layer (LIVE | SHADOW | OFF).
 * Example: <TrustStatus feature="AI Moderation" status="SHADOW" />
 * Or: <TrustStatus capability="aiModeration" /> (status from /api/system/trust-enforcement via context)
 * https://milloapp.com
 */
import React, { useMemo } from 'react';
import { useTrustEnforcementMode } from '../trust/TrustStatusContext.jsx';

const DEFAULT_LABELS = {
  aiModeration: 'AI Moderation',
  kyc: 'Identity verification (KYC)',
  fraudProtection: 'Trust and fraud signals',
};

/** @type {Record<string, string>} */
const FEATURE_TITLE_TO_CAPABILITY = {
  'ai moderation': 'aiModeration',
  'identity verification (kyc)': 'kyc',
  kyc: 'kyc',
  'trust and fraud signals': 'fraudProtection',
  'trust & fraud signals': 'fraudProtection',
};

const DISCLOSURE = {
  LIVE:
    'Full enforcement is active for this capability. Automated checks may affect visibility or access.',
  SHADOW:
    'This capability is in shadow or partial mode. Events may be logged or scored without full automated effect; protections may be limited.',
  OFF:
    'This capability is not fully active for this deployment. Only baseline protections apply.',
};

function resolveCapability(feature, capability) {
  if (capability) return capability;
  if (!feature || typeof feature !== 'string') return null;
  const k = feature.trim().toLowerCase();
  return FEATURE_TITLE_TO_CAPABILITY[k] || null;
}

/**
 * @param {{
 *   feature?: string,
 *   capability?: 'aiModeration'|'kyc'|'fraudProtection',
 *   status?: 'LIVE'|'SHADOW'|'OFF',
 *   className?: string,
 *   id?: string,
 * }} props
 */
export default function TrustStatus({ feature, capability, status: explicitStatus, className = '', id }) {
  const cap = resolveCapability(feature, capability);
  const fromCtx = useTrustEnforcementMode(cap || '');
  const status =
    explicitStatus === 'LIVE' || explicitStatus === 'SHADOW' || explicitStatus === 'OFF'
      ? explicitStatus
      : cap
        ? fromCtx === 'LOADING'
          ? 'OFF'
          : fromCtx === 'ERROR'
            ? 'OFF'
            : fromCtx
        : explicitStatus || 'OFF';

  const title =
    feature ||
    (cap ? DEFAULT_LABELS[cap] || cap : 'Trust status');

  const body = useMemo(() => DISCLOSURE[status] || DISCLOSURE.OFF, [status]);

  const sectionId = id || `trust-status-${(cap || 'general').replace(/[^a-z0-9-]/gi, '-')}`;

  if (cap && fromCtx === 'LOADING') {
    return (
      <section
        id={sectionId}
        role="status"
        aria-busy="true"
        className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)] ${className}`}
      >
        Loading trust status for {title}…
      </section>
    );
  }

  return (
    <section
      id={sectionId}
      role="status"
      aria-live="polite"
      className={`rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] ${className}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span
          className="mt-0.5 inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide tabular-nums"
          aria-hidden="true"
          data-trust-enforcement={status}
        >
          {status === 'LIVE' && (
            <span className="text-emerald-600 dark:text-emerald-400">Live</span>
          )}
          {status === 'SHADOW' && (
            <span className="text-amber-600 dark:text-amber-400">Shadow</span>
          )}
          {status === 'OFF' && <span className="text-[var(--text-muted)]">Off</span>}
        </span>
        <p className="min-w-0 flex-1 leading-snug text-[var(--text-muted)]">
          <strong className="font-medium text-[var(--text)]">{title}. </strong>
          {body}
        </p>
      </div>
    </section>
  );
}
