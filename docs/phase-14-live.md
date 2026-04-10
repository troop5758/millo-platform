# Phase 14 — Live Streaming Core (Complete)

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

*Phase 14 complete. Proceed to next phase in specified order.*
