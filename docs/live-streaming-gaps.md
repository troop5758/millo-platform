# Live Streaming System Gaps — Remediation

## 1. Stream metadata API

- **PATCH /live/stream/:streamId** (existing) — Extended to accept:
  - `title`, `category`, `tags`, `thumbnail` / `thumbnailUrl`, `language`, `meta`, `contentCategory`, `visibility`, `priceCents`
- **LiveStream schema** — Added `language` (string, optional). `thumbnailUrl` was already present.

## 2. Co-host invite system

- **Collection**: `CoHostInvite` (existing) — `streamId`, `inviterId`, `inviteeId`, `status` (pending|accepted|rejected).
- **APIs**:
  - **POST /live/cohost/invite** — Invite user to co-host (body: `streamId`, `userId`).
  - **POST /live/cohost/accept** — Accept invite (body: `streamId`, optional `inviteId`).
  - **POST /live/cohost/reject** — Reject invite (body: `streamId`, optional `inviteId`). *(Added.)*
  - **POST /live/cohost/remove** — Remove co-host (body: `streamId`, `userId`).

## 3. Chat word filter

- **Service**: `services/moderation/chatFilter.js`
  - Redis key: `chat:banned` (SET of banned words).
  - `filterChat(text)` — Returns `true` if allowed, `false` if contains a banned word (case-insensitive substring).
  - `getBannedWords()`, `addBannedWord(word)`, `removeBannedWord(word)`, `invalidateCache()`.
- **Live chat**: **POST /live/stream/:streamId/chat** — Runs `filterChat(trimmed)`; if disallowed, returns `400` with `error: 'CHAT_FILTERED'`.
- **Admin**:
  - **GET /live/moderation/chat-banned** — List banned words.
  - **POST /live/moderation/chat-banned** — Add word (body: `word`).
  - **DELETE /live/moderation/chat-banned** — Remove word (body or query: `word`).

## 4. Device analytics module

- **Collection**: `LiveDeviceMetrics` — `streamId`, `viewerId`, `sessionId`, `deviceType`, `bitrate`, `droppedFrames`, `connectionQuality`, `latency`, `fps`, `resolution`, `meta`.
- **POST /live/metrics** — Accepts and stores: `bitrate`, `droppedFrames`, `connectionQuality`, `deviceType` in addition to existing `latency`, `fps`, `packetLoss`, `resolution`. Writes to both `LiveStreamMetrics` and `LiveDeviceMetrics` (when device fields are present).
- **GET /live/stream/:streamId/device-analytics** — Response now includes `deviceMetrics` (recent `LiveDeviceMetrics` for the stream).

## 5. Live filters SDK

- **Backend** (`@millo/live` filtersEngine): New filter IDs: `face_smoothing`, `background_blur`, `ar_masks` with `webgl: true`, `sdk: 'tensorflow'`. API continues to expose them via **GET /live/filters/list** and **GET /live/filters/:name**.
- **Client SDK**: `packages/web/src/lib/liveFiltersSDK.js` — Entry point: `isWebGLFilter(filterConfig)`, `createLiveFilterPipeline({ filterId })` returning `{ apply(video, canvas), dispose() }`. Stub pipelines in `liveFiltersSDK/backgroundBlur.js`, `faceSmoothing.js`, `arMasks.js` (draw video to canvas; TODO: TensorFlow.js body-segmentation, face mesh, landmarks).
- **Doc**: `docs/live-filters-sdk.md` — Integration notes, optional deps (`@tensorflow/tfjs`, `@tensorflow-models/body-segmentation`), and kill switch `LIVE_FILTERS_ENABLED`.
