/**
 * Edge feed personalization — Cloudflare Worker (example).
 * Routes feed requests by CF-IPCountry to region-specific API paths (low-latency path selection).
 * https://milloapp.com
 *
 * Wrangler: set MILLO_API_ORIGIN (e.g. https://api.milloapp.com) and routes for your feed URL pattern.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const country = request.headers.get('CF-IPCountry') || 'XX';
    const apiOrigin = env.MILLO_API_ORIGIN || 'https://api.milloapp.com';

    const isFeedPath =
      url.pathname === '/feed'
      || url.pathname.startsWith('/feed/')
      || url.pathname.startsWith('/api/feed');

    if (!isFeedPath) {
      return fetch(request);
    }

    const regionalPath = country === 'US' ? '/feed/us' : '/feed/global';
    const target = new URL(regionalPath + url.search, apiOrigin);

    const headers = new Headers(request.headers);
    headers.set('x-edge-country', country);

    return fetch(
      new Request(target, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      }),
    );
  },
};
