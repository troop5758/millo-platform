# Cloudflare CDN Configuration for Millo

**Domain:** milloapp.com, api.milloapp.com, cdn.milloapp.com, hls.milloapp.com

## Page Rules / Cache Rules

| URL Pattern | Cache Level | Edge TTL | Browser TTL |
|-------------|-------------|----------|-------------|
| `cdn.milloapp.com/*` | Cache Everything | 1 day | 1 hour |
| `*.milloapp.com/static/*` | Cache Everything | 1 day | 1 hour |
| `hls.milloapp.com/live/*.m3u8` | Cache Everything | 2s | 0 |
| `hls.milloapp.com/live/*.ts` | Cache Everything | 10s | 0 |
| `hls.milloapp.com/vod/*/*.m3u8` | Cache Everything | 2s | 0 |
| `hls.milloapp.com/vod/*/*.ts` | Cache Everything | 10s | 0 |
| `api.milloapp.com/health` | Bypass | - | - |
| `api.milloapp.com/*` | Bypass (default) | - | - |

## Origin

- **API:** `api.milloapp.com` → ALB / K8s Ingress
- **CDN assets:** `cdn.milloapp.com` → S3 bucket or origin server
- **HLS (Live):** `hls.milloapp.com/live/*` → Streaming service (nginx-rtmp / Janus)
- **HLS (VOD):** `hls.milloapp.com/vod/*` → S3 bucket (populated by `ffmpeg.worker` when `S3_VOD_BUCKET` is set)

## Security

- SSL/TLS: Full (strict)
- Always Use HTTPS: On
- Min TLS: 1.2

---

## Part 2 — Multi-Region Routing Notes

When running multiple Kubernetes clusters per region (e.g. US-East, US-West, Europe, Asia), route **`api.milloapp.com`** to the **nearest healthy** region with **failover** when a region is down.

See the full runbook: **`infra/multi-region-geo-routing.md`** (Cloudflare Load Balancing vs Route 53 latency/failover, health checks on `/health`).

This file focuses on CDN caching rules; geo routing is configured at DNS / load balancer layer.

---

## Part 3 — CDN + video delivery (HLS pipeline)

Goals (fast playback, lower origin load), Cloudflare vs **CloudFront**, pipeline **Janus → FFmpeg → HLS → S3 → CDN → user**, and FFmpeg examples: **`infra/cdn-video-delivery.md`**.
