/**
 * Binds UI to control-plane capability modes (GET /api/system/control-plane).
 * @example
 * <FeatureGate capability="payments" allow={['LIVE']}>
 *   <PaymentsUI />
 * </FeatureGate>
 * https://milloapp.com
 */
import { useState, useEffect, useMemo } from 'react';
import { fetchControlPlaneSnapshot } from '../sdk/controlPlaneApi';

export function FeatureGate({
  capability,
  allow = ['LIVE'],
  fallback = null,
  children,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchControlPlaneSnapshot()
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch((e) => {
        if (!cancelled) setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedSet = useMemo(() => new Set(allow), [allow]);
  const mode = snapshot?.capabilities?.[capability]?.mode;

  if (error || !snapshot) {
    return fallback;
  }
  if (!mode || !allowedSet.has(mode)) {
    return fallback;
  }
  return children;
}
