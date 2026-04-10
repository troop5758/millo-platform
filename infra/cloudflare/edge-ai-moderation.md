# Part 8 — Edge AI moderation (advanced)

**Domain:** https://milloapp.com (and API / CDN hostnames proxied through Cloudflare).

**Broader edge intelligence** (moderation + feed routing examples): **`infra/cloudflare/edge-ai-low-latency.md`**

Edge moderation runs **before** traffic reaches Millo’s API. It complements **in-process AI moderation** (`packages/api/src/services/aiModeration.service.js`) and **Cloudflare Bot Management** (`infra/cloudflare-bot-management.md`).

---

## Video / media moderation

Heavy models (image/video frames, FFmpeg) stay on the **API/worker** path — not in a lightweight Worker. Use this Worker for **text** and **request metadata** at the edge.

---

## Cloudflare Worker (example)

Source: `infra/cloudflare/workers/edge-moderation.example.js`

- Inspects `POST`/`PUT`/`PATCH` bodies (text, JSON, form-like `content-type`).
- Blocks if a **banned substring** matches (default `banned_word`; override with env `BANNED_SUBSTRINGS` comma-separated).
- Optional **spam heuristic** when `SPAM_CHECK=true` (length, repeated characters).

Deploy:

```bash
cd infra/cloudflare/workers
# Copy wrangler.edge-moderation.toml.example → wrangler.toml, set routes, then:
npx wrangler deploy
```

---

## Use cases

| Use case | Edge approach |
|----------|----------------|
| **Chat filtering (real-time)** | Route Worker in front of chat POST paths; substring / list checks; optional [Cloudflare Lists](https://developers.cloudflare.com/waf/tools/lists/) or KV for dynamic terms. |
| **Spam detection** | Heuristics in Worker; escalate to API `aiModeration` for deep checks; rate-limit per IP in WAF. |
| **Bot blocking** | **Bot Fight Mode / Super Bot Fight Mode**, WAF rules, Turnstile — see `infra/cloudflare-bot-management.md`. |

---

## Benefits

- Reduces origin load for obviously bad requests.
- Low-latency block path at the nearest PoP.
- Global coverage with Cloudflare’s network.

---

*Production: bind routes only to paths that should be inspected; avoid caching `POST` responses.*
