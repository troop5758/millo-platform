/**
 * Production Truth Layer — single fetch of /health production_truth for honest UI badges.
 * https://milloapp.com
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { fetchPublicTrustSnapshot, fetchTrustEnforcementSnapshot } from '../sdk/trustApi.js';

const TrustContext = createContext(null);

/** @type {Record<string, string>} */
const FEATURE_ALIASES = {
  moderation: 'aiModeration',
};

export function TrustStatusProvider({ children }) {
  const [truth, setTruth] = useState(null);
  const [enforcement, setEnforcement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, e] = await Promise.all([
        fetchPublicTrustSnapshot(),
        fetchTrustEnforcementSnapshot().catch(() => null),
      ]);
      setTruth(t);
      setEnforcement(e);
    } catch (e) {
      setError(e);
      setTruth(null);
      setEnforcement(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ truth, enforcement, loading, error, refresh }),
    [truth, enforcement, loading, error, refresh]
  );

  return <TrustContext.Provider value={value}>{children}</TrustContext.Provider>;
}

/**
 * @param {string} feature - payments | payouts | kyc | moderation | fraudProtection | email | push | aiModeration
 * @returns {'LOADING'|'ERROR'|'UNKNOWN'|'LIVE'|'BETA'|'DISABLED'}
 */
export function useFeatureStatus(feature) {
  const ctx = useContext(TrustContext);
  if (!ctx) return 'UNKNOWN';
  const { truth, loading, error } = ctx;
  if (loading) return 'LOADING';
  if (error || !truth) return 'ERROR';
  const key = FEATURE_ALIASES[feature] || feature;
  const row = truth[key];
  const st = row?.status;
  if (st === 'LIVE' || st === 'BETA' || st === 'DISABLED') return st;
  return 'UNKNOWN';
}

export function useTrustRefresh() {
  const ctx = useContext(TrustContext);
  return ctx?.refresh;
}

/**
 * Trust Enforcement mode (LIVE | SHADOW | OFF) for aiModeration | kyc | fraudProtection.
 * @param {string} capabilityId
 * @returns {'LOADING'|'ERROR'|'OFF'|'SHADOW'|'LIVE'}
 */
export function useTrustEnforcementMode(capabilityId) {
  const ctx = useContext(TrustContext);
  if (!ctx) return 'OFF';
  const { enforcement, loading, error } = ctx;
  if (loading) return 'LOADING';
  if (error && !enforcement) return 'ERROR';
  const key = FEATURE_ALIASES[capabilityId] || capabilityId;
  const row = enforcement?.trustMode?.[key];
  const en = row?.enforcement;
  if (en === 'LIVE' || en === 'SHADOW' || en === 'OFF') return en;
  return 'OFF';
}

/**
 * Raw production_truth rows from GET /health (same source as badges).
 * @returns {{ truth: Record<string, { status: string, detail?: unknown }>|null, loading: boolean, error: Error|null }}
 */
export function useTrustProductionTruth() {
  const ctx = useContext(TrustContext);
  if (!ctx) {
    return { truth: null, enforcement: null, loading: false, error: null };
  }
  return {
    truth: ctx.truth,
    enforcement: ctx.enforcement,
    loading: ctx.loading,
    error: ctx.error,
  };
}
