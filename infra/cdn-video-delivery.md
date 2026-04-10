# CDN + video delivery

**Production:** https://milloapp.com  
**HLS hostname (example):** `hls.milloapp.com` — see cache rules in `infra/cloudflare/cdn-rules.md`.

## Goals

- **Ultra-fast video playback** — segments and playlists served from edge POPs close to the user (low TTFB, high cache hit ratio).
- **Reduce origin load** — API and transcode/origin servers are not hit for every segment; CDN absorbs most bytes.

---

## CDN options

| Option | Typical use |
|--------|-------------|
| **Cloudflare CDN** | `cdn.milloapp.com` (static), `hls.milloapp.com` (HLS); cache TTLs in `cdn-rules.md`. SSL Full (strict), cache rules per path. |
| **AWS CloudFront** | Origin = S3 bucket (VOD) or ALB / custom origin (live packager). Behaviors for `*.m3u8` vs `*.ts` with short TTLs for live. |

Configure **CORS** and **signed URLs** if playback URLs must be restricted. Purge or short TTL on live playlists so clients see new segments quickly.

---

## Video pipeline (target flow)

```
Janus  (WebRTC / RTP ingest or bridge to your packager path)
   ↓
FFmpeg  (encode / package)
   ↓
HLS  (index.m3u8 + .ts segments)
   ↓
S3  (optional durable store for VOD or origin for edge)
   ↓
CDN  (Cloudflare or CloudFront)
   ↓
User  (HLS.js / native player)
```

**Notes:**

- **Live** often lands segments on an **origin** (disk/Nginx) or **S3** with frequent upload; the **CDN** pulls from that origin. Exact wiring depends on whether you use nginx-rtmp, a sidecar packager, or `packages/workers/ffmpeg-worker.js` off **RTMP** (or another `-i` source).
- **Janus** in this repo is primarily the **SFU path** for WebRTC; bridging Janus output into FFmpeg may use **GStreamer**, **rtpforward**, or a **recorder plugin** depending on deployment—ops defines the link between Janus and FFmpeg.
- **VOD:** FFmpeg (or a batch job) writes HLS to **S3**; CloudFront or Cloudflare origin points at the bucket (or origin proxy).

**Repo touchpoints:** `infra/k8s/deployment-janus.yaml`, `packages/workers/ffmpeg-worker.js`, **`infra/obs-rtmp-ingest-pro.md`** (OBS/RTMP ingest), `infra/streaming/` (RTMP/HLS compose), API `packages/api/src/lib/s3.js` for prefixes.

---

## HLS output (FFmpeg example)

**Event-style playlist** (common for finite recordings / VOD-style exports):

```bash
ffmpeg -i input \
  -c:v libx264 \
  -f hls \
  -hls_time 4 \
  -hls_playlist_type event \
  index.m3u8
```

**Live / rolling window** (closer to what the Millo worker uses for ongoing streams): short segments, bounded playlist, delete old segments:

```bash
ffmpeg -i input \
  -c:v libx264 -preset veryfast \
  -c:a aac -ar 44100 -ac 2 -b:a 128k \
  -f hls \
  -hls_time 4 \
  -hls_list_size 5 \
  -hls_flags delete_segments+append_list+omit_endlist \
  -hls_segment_filename 'segment%03d.ts' \
  index.m3u8
```

The Node helper **`recordStream()`** in `packages/workers/ffmpeg-worker.js` implements this rolling pattern (tune `hls_time`, `hls_list_size`, and codecs via env or code as needed).

---

## CDN cache hints (HLS)

- **Playlists** (`.m3u8`) — **very short TTL** at edge (e.g. 1–5s live) so players pick up new `#EXTINF` lines.
- **Segments** (`.ts` / `.m4s`) — short TTL for live; longer for immutable VOD segment names.
- **Do not** cache API auth or personalized JSON on the same hostname as HLS unless rules are strict.

See **`infra/cloudflare/cdn-rules.md`** for Millo’s example TTL table.

---

## Related

- Global stack diagram: `infra/global-platform-stack.md`
- Cloudflare rules: `infra/cloudflare/cdn-rules.md`
- Multi-region API DNS: `infra/multi-region-geo-routing.md`
