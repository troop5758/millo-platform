# OBS + RTMP ingest (pro creator feature)

**Production:** https://milloapp.com

## Why

- **Creators stream from OBS Studio** (and similar tools) using **RTMP** — the industry default for live encoding.
- A dedicated **ingest tier** (nginx **RTMP module** or equivalent) accepts the publisher, optionally **records**, **packages HLS**, and signals the **Millo API** (stream key validation, go-live state).

Millo stores **stream keys** on `LiveStream` and exposes them via the API — see **`infra/rtmp-obs.md`** for URL shape and OBS settings.

---

## Stack

| Piece | Role |
|-------|------|
| **NGINX + RTMP module** | Listen on **1935**; `application live` accepts publishers. |
| **Hooks** | `on_publish` / `on_done` → API to authorize key and update lifecycle (see full `infra/streaming/nginx.conf`). |
| **HLS / FFmpeg** | Optional in-nginx HLS or sidecar **FFmpeg** → CDN path (`infra/cdn-video-delivery.md`). |

**Reference compose:** `infra/streaming/docker-compose.yml` (nginx-rtmp + ffmpeg-worker pattern).

---

## Minimal RTMP config (example)

Barebones **ingest only**, no recording (good for a lab or when recordings are handled elsewhere):

```nginx
rtmp {
  server {
    listen 1935;

    application live {
      live on;
      record off;
    }
  }
}
```

**Production-oriented** config in-repo adds **HLS**, **recording**, **webhooks**, and **CORS** for playback — use as the baseline:

- **`infra/streaming/nginx.conf`** — full `rtmp { ... application live { ... } }` + `http` server for `/live/` HLS and hook receiver on `8081`.

---

## Security and product notes

- **Stream keys** must be validated on **`on_publish`** (reject unknown keys — 403) so random URLs cannot publish.
- **TLS:** RTMP is traditionally **cleartext** on 1935; some setups use **RTMPS** or terminate at a dedicated ingest proxy — document your chosen pattern for `ingest.milloapp.com` (or regional ingest hostnames).
- **Pro / entitlement:** Gate **stream key issuance** and **ingest hostname** in product (subscription tier, creator approval) in the API; this doc is infrastructure only.

---

## Related

| File | Topic |
|------|--------|
| `infra/rtmp-obs.md` | Stream key, OBS Server + Stream key fields |
| `infra/streaming/nginx.conf` | Full nginx-rtmp + HLS + hooks |
| `infra/cdn-video-delivery.md` | HLS → S3 → CDN |
| `packages/workers/ffmpeg-worker.js` | FFmpeg HLS from RTMP URL |
