/**
 * OAuth provider contract for Login / Register.
 * Prefer GET /api/auth/providers { google: "LIVE"|"DISABLED", ... }; only "LIVE" enables buttons.
 * https://milloapp.com
 */

const DEFAULT_CONTRACT = () => ({
  google: 'DISABLED',
  facebook: 'DISABLED',
  apple: 'DISABLED',
  twitter: 'DISABLED',
  github: 'DISABLED',
});

/**
 * @param {string} apiBase
 * @returns {Promise<Record<string, 'LIVE'|'DISABLED'>>}
 */
export async function loadOauthProviderContract(apiBase) {
  const base = String(apiBase || '').replace(/\/$/, '');
  const merge = (raw) => {
    const out = DEFAULT_CONTRACT();
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(out)) {
      if (raw[k] === 'LIVE') out[k] = 'LIVE';
      else if (raw[k] === 'DISABLED') out[k] = 'DISABLED';
    }
    for (const k of Object.keys(raw)) {
      if (raw[k] === 'LIVE' || raw[k] === 'DISABLED') out[k] = raw[k];
    }
    return out;
  };

  try {
    const r = await fetch(`${base}/api/auth/providers`);
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d === 'object') return merge(d);
    }
  } catch {
    /* fall through */
  }

  try {
    const r = await fetch(`${base}/auth/oauth/providers`);
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d === 'object') {
        const out = DEFAULT_CONTRACT();
        for (const k of Object.keys(out)) {
          if (typeof d[k] === 'boolean') out[k] = d[k] ? 'LIVE' : 'DISABLED';
          else if (d[k] === 'LIVE' || d[k] === 'DISABLED') out[k] = d[k];
        }
        for (const k of Object.keys(d)) {
          if (typeof d[k] === 'boolean') out[k] = d[k] ? 'LIVE' : 'DISABLED';
          else if (d[k] === 'LIVE' || d[k] === 'DISABLED') out[k] = d[k];
        }
        return out;
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const r = await fetch(`${base}/api/system/providers`);
    if (r.ok) {
      const providers = await r.json();
      const o = providers?.oauth;
      const detail = o && typeof o.detail === 'object' && o.detail ? o.detail : {};
      if (o && typeof o.status === 'string') {
        return {
          google: o.status === 'LIVE' ? 'LIVE' : 'DISABLED',
          facebook: detail.facebook ? 'LIVE' : 'DISABLED',
          apple: detail.apple ? 'LIVE' : 'DISABLED',
          twitter: 'DISABLED',
          github: 'DISABLED',
        };
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const r = await fetch(`${base}/auth/providers`);
    if (r.ok) {
      const data = await r.json();
      if (data?.oauth) {
        const o = data.oauth;
        return {
          google: o.google ? 'LIVE' : 'DISABLED',
          facebook: o.facebook ? 'LIVE' : 'DISABLED',
          apple: o.apple ? 'LIVE' : 'DISABLED',
          twitter: 'DISABLED',
          github: 'DISABLED',
        };
      }
    }
  } catch {
    /* fall through */
  }

  return DEFAULT_CONTRACT();
}

/**
 * @param {string} apiBase
 * @returns {Promise<{ google: boolean, facebook: boolean, apple: boolean }>}
 */
export async function loadOauthProviderFlags(apiBase) {
  const c = await loadOauthProviderContract(apiBase);
  return {
    google: c.google === 'LIVE',
    facebook: c.facebook === 'LIVE',
    apple: c.apple === 'LIVE',
  };
}
