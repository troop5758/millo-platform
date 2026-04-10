/**
 * Edge moderation — Cloudflare Worker (example).
 * Part 8 — chat filtering / spam heuristics / bot signal at edge before origin.
 * Deploy with Wrangler; bind routes to chat/API paths as needed.
 * https://milloapp.com
 *
 * Use cases:
 * - Chat filtering (real-time): inspect POST body to chat endpoints.
 * - Spam detection: simple heuristics (length, repeated chars); extend with KV/Lists.
 * - Bot blocking: combine with Bot Management + WAF (see infra/cloudflare-bot-management.md).
 */

/** Comma-separated list in env BANNED_SUBSTRINGS (Wrangler [vars] or secrets). */
function getBannedList(env) {
  const raw = env.BANNED_SUBSTRINGS || 'banned_word';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Very light spam signal — tune or replace with ML / API call. */
function looksLikeSpam(text) {
  if (text.length > 20000) return true;
  if (/(.)\1{50,}/.test(text)) return true;
  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only inspect mutating requests with a body (e.g. chat, comments).
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH') {
      return fetch(request);
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('text') && !contentType.includes('json') && !contentType.includes('form')) {
      return fetch(request);
    }

    let body = '';
    try {
      body = await request.text();
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    const lower = body.toLowerCase();
    const banned = getBannedList(env);
    for (const word of banned) {
      if (word && lower.includes(word)) {
        return new Response(JSON.stringify({ error: 'BLOCKED', reason: 'policy' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    if (env.SPAM_CHECK === 'true' && looksLikeSpam(body)) {
      return new Response(JSON.stringify({ error: 'BLOCKED', reason: 'spam' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Reconstruct request for origin (body already consumed).
    const headers = new Headers(request.headers);
    return fetch(new Request(url.toString(), {
      method: request.method,
      headers,
      body,
    }));
  },
};
