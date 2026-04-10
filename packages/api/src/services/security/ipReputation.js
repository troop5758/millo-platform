'use strict';
/**
 * IP Reputation Engine — Cloudflare Radar, IPQualityScore, AbuseIPDB.
 * Score: 0–30 safe, 30–70 suspicious, 70+ blocked.
 * https://milloapp.com
 */
const SCORE_SAFE_MAX = 30;
const SCORE_SUSPICIOUS_MAX = 70;
const BANDS = Object.freeze({ safe: 'safe', suspicious: 'suspicious', blocked: 'blocked' });

function getBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s < 0) return BANDS.safe;
  if (s <= SCORE_SAFE_MAX) return BANDS.safe;
  if (s <= SCORE_SUSPICIOUS_MAX) return BANDS.suspicious;
  return BANDS.blocked;
}

function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const s = ip.trim();
  if (s === '127.0.0.1' || s === '::1' || s.startsWith('::ffff:127.')) return false;
  return s.length > 0;
}

/**
 * Cloudflare Radar / Intel IP (GET with query param). Requires CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.
 */
async function checkCloudflareRadar(ip) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/intel/ip?ip=${encodeURIComponent(ip)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const result = data?.result || data;
    const scoreRaw = result.risk_score ?? result.score ?? result.reputation;
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) return null;
    const normalized = Math.min(100, Math.max(0, score <= 1 ? score * 100 : score));
    return {
      score: Math.round(normalized),
      source: 'cloudflare_radar',
      signals: result.bad ?? false ? ['cf_bad'] : [],
    };
  } catch {
    return null;
  }
}

/**
 * Cloudflare-style IP reputation endpoint (some accounts use custom endpoint).
 */
async function checkCloudflare(ip) {
  if (process.env.CLOUDFLARE_IP_REPUTATION_ENABLED !== 'true') return null;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ip-reputation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ip }),
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const result = data?.result || {};
    const scoreRaw = result.risk_score ?? result.riskScore ?? result.score;
    const score = Number(scoreRaw);
    if (!Number.isFinite(score)) return null;
    const normalized = Math.min(100, Math.max(0, score <= 1 ? score * 100 : score));
    return {
      score: Math.round(normalized),
      source: 'cloudflare',
      signals: Array.isArray(result.signals) ? result.signals : [],
    };
  } catch {
    return null;
  }
}

/**
 * IPQualityScore — requires IPQS_API_KEY.
 */
async function checkIPQualityScore(ip) {
  const key = process.env.IPQS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(key)}/${encodeURIComponent(ip)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const fraud = Number(data?.fraud_score ?? data?.risk_score ?? 0);
    const score = Math.min(100, Math.max(0, Number.isFinite(fraud) ? fraud : 0));
    const signals = [];
    if (data?.proxy) signals.push('proxy');
    if (data?.vpn) signals.push('vpn');
    if (data?.tor) signals.push('tor');
    if (data?.bot_status) signals.push('bot');
    return { score: Math.round(score), source: 'ipqualityscore', signals };
  } catch {
    return null;
  }
}

/**
 * AbuseIPDB — requires ABUSEIPDB_API_KEY.
 */
async function checkAbuseIPDB(ip) {
  const key = process.env.ABUSEIPDB_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}`,
      {
        headers: {
          Key: key,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const abuseScore = Number(data?.data?.abuseConfidenceScore ?? 0);
    const score = Math.min(100, Math.max(0, Number.isFinite(abuseScore) ? abuseScore : 0));
    const signals = [];
    if (data?.data?.usageType?.toLowerCase?.().includes('hosting')) signals.push('hosting');
    if (abuseScore >= 75) signals.push('abuse_reported');
    return { score: Math.round(score), source: 'abuseipdb', signals };
  } catch {
    return null;
  }
}

/**
 * Get IP reputation score (0–100) and band. Tries Cloudflare, IPQualityScore, AbuseIPDB; takes worst score.
 */
async function getScore(ip) {
  if (!isValidIp(ip)) return { score: 0, band: BANDS.safe, source: 'none', signals: [] };
  const results = await Promise.all([
    checkCloudflare(ip),
    checkCloudflareRadar(ip),
    checkIPQualityScore(ip),
    checkAbuseIPDB(ip),
  ]);
  const valid = results.filter(Boolean);
  if (valid.length === 0) return { score: 0, band: BANDS.safe, source: 'none', signals: [] };
  const worst = valid.reduce((acc, r) => (r.score > acc.score ? r : acc));
  const band = getBand(worst.score);
  return {
    score: worst.score,
    band,
    source: worst.source,
    signals: worst.signals || [],
  };
}

/**
 * Check if IP should be blocked (score > 70).
 */
async function isBlocked(ip) {
  const { score, band } = await getScore(ip);
  return { blocked: band === BANDS.blocked, score, band };
}

module.exports = {
  getScore,
  getBand,
  isBlocked,
  BANDS,
  SCORE_SAFE_MAX,
  SCORE_SUSPICIOUS_MAX,
};
