/**
 * API base URL for backend calls (no trailing slash).
 * Always use this (or `apiUrl`) for fetch — never relative URLs like `/payments/...` or the SPA returns HTML.
 * Millo API routes are rooted at the host (e.g. `/auth/...`, `/payments/...`), not `/api/...`.
 * Production default: https://api.milloapp.com (see import.meta.env.VITE_API_URL).
 * https://milloapp.com
 */
export function getApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return String(import.meta.env.VITE_API_URL).replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.__MILLO_API_URL) {
    return String(window.__MILLO_API_URL).replace(/\/$/, '');
  }
  if (typeof import.meta !== 'undefined' && import.meta.env.PROD) {
    return 'https://api.milloapp.com';
  }
  return 'http://localhost:3000';
}

/** Absolute URL for an API path (must start with `/`). */
export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export const API_BASE = getApiBase();
