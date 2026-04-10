# Edge AI — low-latency intelligence (Cloudflare Workers)

**Production:** https://milloapp.com

## Goals

1. **Moderate content before it reaches the backend** — reject obvious policy violations at the nearest PoP (lower origin CPU, faster block response).
2. **Personalize feed at the edge** — route or rewrite feed requests by geography (or other signals) without an extra round trip through a central router.

Workers complement **API moderation** (`packages/api/src/services/aiModeration.service.js`), **Kafka moderation workers**, and **WAF / Bot Management** — they are not a full replacement for deep ML or appeals workflows.

---

## Platform: Cloudflare Workers

- Deploy with **Wrangler**; bind **routes** to `api.milloapp.com` paths (or a dedicated edge hostname) that should run Worker logic.
- Keep **AI shadow mode** and product policy in mind: edge blocks should be **conservative** and observable (logs, analytics) where required.
- **Do not cache** `POST` responses by default; use **Bypass** for authenticated API paths unless you have a deliberate cache design.

---

## Example — edge moderation (minimal)

Concept: read the body, block on a simple rule, otherwise forward to origin.

```javascript
export default {
  async fetch(request) {
    const body = await request.text();

    if (body.toLowerCase().includes('banned')) {
      return new Response('Blocked', { status: 403 });
    }

    // Body was consumed — rebuild the request to the origin.
    return fetch(new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    }));
  },
};
```

**Production-oriented example** (method filter, JSON errors, env-driven word list):  
`infra/cloudflare/workers/edge-moderation.example.js`  
**Runbook:** `infra/cloudflare/edge-ai-moderation.md`

---

## Example — edge feed personalization (by country)

Use **Cloudflare’s country** signal (`CF-IPCountry`) to choose an upstream feed path. Workers cannot call `fetch("/feed/us")` with a relative URL — use your **origin base URL** (secret or `vars`).

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const country = request.headers.get('CF-IPCountry') || 'XX';
    const apiOrigin = env.MILLO_API_ORIGIN || 'https://api.milloapp.com';

    if (url.pathname === '/feed' || url.pathname.startsWith('/feed/')) {
      const path = country === 'US' ? '/feed/us' : '/feed/global';
      const target = new URL(path + url.search, apiOrigin);
      const headers = new Headers(request.headers);
      headers.set('x-edge-country', country);
      return fetch(new Request(target, { method: request.method, headers, body: request.body }));
    }

    return fetch(request);
  },
};
```

Tune paths to match your real API (`/api/discovery/feed`, etc.). For **authenticated** feeds, forward **`Authorization`** and avoid caching personalized responses at the edge unless explicitly designed.

---

## When to keep logic off the edge

| Concern | Prefer origin / worker queue |
|--------|------------------------------|
| Heavy models (vision, long context LLM) | API or GPU workers |
| User-specific embeddings / full graph | API + database |
| Financial or legally sensitive decisions | API + audit trail |

---

## Related files

| File | Purpose |
|------|---------|
| `workers/edge-moderation.example.js` | Text body checks, spam heuristics |
| `workers/wrangler.edge-moderation.toml.example` | Wrangler template |
| `edge-ai-moderation.md` | Part 8 edge moderation runbook |
| `cdn-rules.md` | Cache behavior for `api` vs static vs HLS |
