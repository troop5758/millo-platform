'use strict';
/**
 * IP Reputation — Cloudflare Radar, IPQualityScore, AbuseIPDB (via security/ipReputation); fallback: IP2Proxy, MaxMind.
 * Score bands: 0–30 safe, 30–70 suspicious, 70+ blocked. Block when score > 70 (or IP_RISK_THRESHOLD_BLOCK).
 * https://milloapp.com
 */
const IP_RISK_THRESHOLD_BLOCK = Number(process.env.IP_RISK_THRESHOLD_BLOCK || 70);
let _securityIpReputation = null;
function getSecurityIpReputation() {
  if (_securityIpReputation !== null) return _securityIpReputation;
  try {
    _securityIpReputation = require('./security/ipReputation');
  } catch {
    _securityIpReputation = false;
  }
  return _securityIpReputation;
}

function isValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const s = ip.trim();
  if (!s) return false;
  if (s === '127.0.0.1' || s === '::1' || s.startsWith('::ffff:127.')) return false;
  return true;
}

/**
 * MaxMind minFraud Score — requires MAXMIND_ACCOUNT_ID, MAXMIND_LICENSE_KEY.
 * Returns risk_score 0–100.
 */
async function checkMaxMind(ip) {
  const accountId = process.env.MAXMIND_ACCOUNT_ID;
  const licenseKey = process.env.MAXMIND_LICENSE_KEY;
  if (!accountId || !licenseKey) return null;

  try {
    const auth = Buffer.from(`${accountId}:${licenseKey}`).toString('base64');
    const res = await fetch('https://minfraud.maxmind.com/minfraud/v2.0/score', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        device: { ip_address: ip },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const score = data?.risk_score;
    if (typeof score === 'number' && score >= 0 && score <= 100) {
      return { riskScore: Math.round(score), source: 'maxmind', signals: data?.risk_score_reasons || [] };
    }
  } catch {}
  return null;
}

/**
 * IP2Proxy — proxy/VPN/TOR detection. Requires IP2PROXY_API_KEY.
 * Maps isProxy, proxyType, threat to risk score.
 */
async function checkIP2Proxy(ip) {
  const key = process.env.IP2PROXY_API_KEY;
  if (!key) return null;

  try {
    const url = `https://api.ip2proxy.com/?ip=${encodeURIComponent(ip)}&key=${encodeURIComponent(key)}&package=PX9&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.response !== 'OK') return null;

    const signals = [];
    let riskScore = 0;

    if (data.isProxy === 'YES') {
      const pt = (data.proxyType || '').toUpperCase();
      if (pt === 'VPN' || pt === 'TOR') {
        riskScore = 90;
        signals.push('proxy_vpn_tor');
      } else if (pt === 'PUB' || pt === 'WEB') {
        riskScore = 85;
        signals.push('proxy_public');
      } else if (pt === 'DCH') {
        riskScore = 40;
        signals.push('proxy_datacenter');
      } else {
        riskScore = 60;
        signals.push('proxy');
      }
    }

    const threat = (data.threat || '').toUpperCase();
    if (threat === 'BOTNET' || threat === 'SCANNER' || threat === 'SPAM') {
      riskScore = Math.max(riskScore, 95);
      signals.push(`threat_${threat.toLowerCase()}`);
    }

    const countryCode = data?.countryCode ? String(data.countryCode).toUpperCase().slice(0, 2) : null;
    if (riskScore > 0) {
      return { riskScore, source: 'ip2proxy', signals, countryCode };
    }
    if (countryCode) {
      return { riskScore: 0, source: 'ip2proxy', signals: [], countryCode };
    }
  } catch {}
  return null;
}

/**
 * Cloudflare — when behind CF, CF-Connecting-IP is the real IP.
 * CF doesn't expose risk score in headers; use as IP source only.
 * Placeholder for future CF Bot Management / Firewall API.
 */
async function checkCloudflare(ip) {
  if (process.env.CLOUDFLARE_IP_REPUTATION_ENABLED !== 'true') return null;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) return null;

  try {
    // Cloudflare API (account-scoped). Endpoint contract may vary by account setup,
    // so parsing below accepts multiple risk score shapes.
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ip-reputation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ip }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.success) return null;

    const result = data.result || {};
    const scoreRaw = result.risk_score ?? result.riskScore ?? result.score ?? result.ip?.risk_score;
    const score = Number(scoreRaw);
    const countryCode = result.country || result.country_code || result.countryCode || null;
    const signals = Array.isArray(result.signals) ? result.signals : [];
    if (Number.isFinite(score) && score >= 0 && score <= 100) {
      return {
        riskScore: Math.round(score),
        source: 'cloudflare',
        signals,
        countryCode: countryCode ? String(countryCode).toUpperCase().slice(0, 2) : undefined,
      };
    }
  } catch {}
  return null;
}

/**
 * Get IP risk score. Tries security/ipReputation (Cloudflare Radar, IPQualityScore, AbuseIPDB), then legacy Cloudflare/MaxMind/IP2Proxy.
 * Returns { riskScore, source, signals, countryCode?, band? }. Score 0–30 safe, 30–70 suspicious, 70+ blocked.
 */
async function getIpRiskScore(ip) {
  if (!isValidIp(ip)) return { riskScore: 0, source: 'none', signals: [] };

  const engine = getSecurityIpReputation();
  if (engine && typeof engine.getScore === 'function') {
    const result = await engine.getScore(ip);
    return {
      riskScore: result.score,
      source: result.source || 'security_engine',
      signals: result.signals || [],
      band: result.band,
    };
  }

  const result = await checkCloudflare(ip) || await checkMaxMind(ip) || await checkIP2Proxy(ip);
  if (result) {
    const band = result.riskScore <= 30 ? 'safe' : result.riskScore <= 70 ? 'suspicious' : 'blocked';
    return { ...result, band };
  }

  return { riskScore: 0, source: 'none', signals: [] };
}

/**
 * Get country code from IP. Uses IP2Proxy or CF-IPCountry when available.
 * Returns ISO 3166-1 alpha-2 (e.g. US, BR) or null.
 */
async function getIpCountry(ip, headers = {}) {
  const cf = headers?.['cf-ipcountry'] || headers?.['CF-IPCountry'];
  if (cf && cf !== 'XX' && cf.length >= 2) return cf.toUpperCase().slice(0, 2);

  const { countryCode } = await getIpRiskScore(ip);
  return countryCode || null;
}

/**
 * Check if IP should be blocked. Returns { allowed, riskScore }.
 * Blocks when riskScore > 80.
 */
async function checkIpReputation(ip) {
  const { riskScore } = await getIpRiskScore(ip);
  return {
    allowed: riskScore <= IP_RISK_THRESHOLD_BLOCK,
    riskScore,
  };
}

module.exports = {
  getIpRiskScore,
  getIpCountry,
  checkIpReputation,
  IP_RISK_THRESHOLD_BLOCK,
};
