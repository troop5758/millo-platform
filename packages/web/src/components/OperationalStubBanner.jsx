import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTrustProductionTruth } from '../trust/TrustStatusContext.jsx';

/** Map UI feature prop → production_truth key */
const FEATURE_ALIASES = {
  moderation: 'aiModeration',
};

const DEFAULT_KEYS = [
  'payments',
  'payouts',
  'kyc',
  'email',
  'push',
  'oauth',
  'aiModeration',
  'fraudProtection',
];

function formatDetail(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d;
  try {
    return JSON.stringify(d);
  } catch {
    return String(d);
  }
}

/**
 * Lists capabilities that are not LIVE (BETA = stub/partial, DISABLED = off).
 * Uses public GET /health → checks.production_truth via TrustStatusProvider.
 * https://milloapp.com
 *
 * @param {{ features?: string[], variant?: 'user'|'admin', className?: string }} props
 */
export function OperationalStubBanner({ features, variant = 'user', className = '' }) {
  const { t } = useTranslation();
  const { truth, loading, error } = useTrustProductionTruth();

  const issues = useMemo(() => {
    if (!truth || loading || error) return [];
    const keys = Array.isArray(features) && features.length > 0 ? features : DEFAULT_KEYS;
    const out = [];
    for (const f of keys) {
      const k = FEATURE_ALIASES[f] || f;
      const row = truth[k];
      const st = row?.status;
      if (st === 'BETA' || st === 'DISABLED') {
        out.push({ key: k, feature: f, status: st, detail: row?.detail });
      }
    }
    return out;
  }, [truth, loading, error, features]);

  if (loading || error || !truth || issues.length === 0) return null;

  const base =
    'rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100';

  return (
    <div role="status" className={`${base} ${className}`.trim()}>
      <p className="font-semibold text-amber-950 dark:text-amber-50 mb-1.5">
        {variant === 'admin'
          ? t('operational.bannerTitleAdmin', 'Deployment mode — not all rails are LIVE')
          : t('operational.bannerTitle', 'This deployment is not fully live for every service')}
      </p>
      <p className="text-xs opacity-90 mb-2">
        {t(
          'operational.bannerHint',
          'BETA usually means stub, partial config, or env-gated. DISABLED means off. Confirm with operators before assuming production behavior.'
        )}
      </p>
      <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm">
        {issues.map((i) => (
          <li key={i.key}>
            <strong>{t(`operational.feature.${i.feature}`, i.key)}</strong>
            {' — '}
            <span className="font-mono">{i.status}</span>
            {variant === 'admin' && i.detail != null && (
              <span className="block mt-0.5 pl-4 font-mono text-[10px] sm:text-xs opacity-80 break-all">
                {formatDetail(i.detail)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default OperationalStubBanner;
