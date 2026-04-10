# Phase 4 — Live Streaming Core (Complete)

## Stream lifecycle

- **Start:** `live.startStream(userId, { title? })` — creates `LiveStream` with `status: 'live'`, `startedAt`, writes `AuditLog` `action: 'live.stream.start'`.
- **End:** `live.endStream(streamId)` — sets `status: 'ended'`, `endedAt`, writes `AuditLog` `action: 'live.stream.end'`.
- **Get:** `live.getStream(streamId)`.

Implemented in `packages/live/src/streamLifecycle.js`.

## Moderation

- **moderateStream(streamId, moderatorId, action, meta?)** — writes `ModerationLog` and `AuditLog` `action: 'live.stream.moderate'`. If `action === 'suspend'`, ends the stream and audits `live.stream.end` with `reason: 'moderation_suspend'`.

Implemented in `packages/live/src/moderation.js`.

## Viewer tracking

- **joinViewer(streamId, { userId?, anonymousId? })** — creates `LiveViewer`, audits `action: 'live.viewer.join'`.
- **leaveViewer(viewerId)** — sets `leftAt`, audits `action: 'live.viewer.leave'`.
- **getViewerCount(streamId)** — count of viewers with `leftAt: null`.

Implemented in `packages/live/src/viewerTracking.js`.

## WebSocket gateway

- **Path:** `GET /live/ws?streamId=...` (WebSocket upgrade).
- **Behavior:** Clients subscribe by `streamId`; server broadcasts to room when viewer count changes or stream ends or moderation event. Messages: `{ type: 'viewer_count', count }`, `{ type: 'stream_ended', streamId }`, `{ type: 'moderation', action }`.

Implemented in `packages/api/src/routes/live.js` (liveRoutes + liveWebSocket). Requires `@fastify/websocket` on the API.

## API routes

| Method | Path | Body/Params | Description |
|--------|------|-------------|-------------|
| POST | /live/start | { userId, title? } | Start stream |
| POST | /live/end/:streamId | — | End stream |
| GET | /live/stream/:streamId | — | Get stream + viewerCount |
| POST | /live/join | { streamId, userId?, anonymousId? } | Join as viewer |
| POST | /live/leave | { viewerId } | Leave (set leftAt) |
| POST | /live/moderate | { streamId, moderatorId, action, meta? } | Moderation |
| GET | /live/ws | query: streamId | WebSocket gateway |

## Validation

- **Start/End works:** Start stream → status `live`, `startedAt` set; end stream → status `ended`, `endedAt` set.
- **Actions audited:** Every start, end, join, leave, moderate writes to `AuditLog` (and moderation to `ModerationLog`).

Run: `npm run validate:phase4` from repo root (requires MongoDB and `npm install` so workspace deps resolve).

---

## Multi-Region Strategy (Part 2)

### Region Routing (Cloudflare / Route53)

Goal: `api.milloapp.com` always sends a user to the nearest healthy region.

Recommended options (either one is fine):

1. **Cloudflare Load Balancer / Geo Steering**
   - Keep `api.milloapp.com` as a Cloudflare hostname.
   - Configure three origins (one per region) pointing at each region's ingress/LB:
     - `us-east` -> `us-east-api.<your-domain>` (or the regional Ingress hostname)
     - `eu-west` -> `eu-west-api.<your-domain>`
     - `ap-south` -> `ap-south-api.<your-domain>`
   - Use health checks on `/health` to automatically fail over.
   - Optional: add session stickiness if your auth relies on short-lived in-memory state (JWT should minimize this need).

2. **Route53 Latency-Based Routing (when managing DNS outside Cloudflare)**
   - Create three Route53 records (alias/weighted) for `api.milloapp.com`.
   - Point each record to the region's ALB/ingress endpoint.
   - Choose failover/latency policies that match your operational model.

### Database Strategy

Match storage locality to access patterns:

| Data Type | Strategy |
|---|---|
| Users | **Primary region** (e.g. `us-east`) with **replica read nodes** in other regions. Use read preference for EU/ASIA reads; write traffic stays at the primary. |
| Videos (VOD / assets) | Store in **S3 with multi-region replication** (or multi-bucket + replication). CDN reads are served from nearest edge. |
| Live streams | Keep **region-local**: a live stream's `LiveStream`, `LiveViewer`, and related ephemeral state should be created and served by the region that currently owns the websocket/http traffic. |
| Cache | Use **region-local Redis** for feed cache and short TTL rate limits (avoid cross-region Redis for latency). |

---

*Phase 4 complete. Proceed to next phase in specified order.*
