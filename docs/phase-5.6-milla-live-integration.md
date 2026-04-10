# Phase 5.6 — MILLA Live Integration (Complete)

## Co-host

- **API:** `POST /live/milla/cohost` — body `{ streamId, enabled }`. Enables or disables MILLA as co-host for a stream.
- **Implementation:** `packages/milla/src/liveIntegration.js` — `setCoHost(streamId, enabled)`, `isCoHost(streamId)`.

## Gift triggers

- **API:** `POST /live/milla/gift` — body `{ streamId, gift }`. When MILLA is co-host and not kill-switched and throttle allows, calls `reactToGift(gift, streamId)`.
- **Implementation:** `onGift(streamId, gift)` — checks kill-switch, co-host, throttle, then `giftReactions.reactToGift`.

## AI throttling

- **Implementation:** `liveIntegration.js` — gift reactions throttled per stream: at most one reaction every `THROTTLE_MS` (10s). `throttleAllowsGiftReaction(streamId)`; `recordGiftReaction(streamId)` after each reaction.

## Force mute

- **API:** `POST /live/milla/mute` — body `{ streamId, muted }`. When `muted: true`, MILLA voice out for that stream is skipped; when `muted: false`, unmute.
- **Implementation:** `forceMute(streamId)`, `forceUnmute(streamId)`, `isMuted(streamId)`. Voice hooks call `setMutedCheck(fn)` with `isMuted`; `emitHook('out', data)` skips if `mutedCheck(data.streamId)` is true.

## Kill-switch

- **Env:** `MILLA_ENABLED`. When set to `'false'`, `onGift` returns null and no MILLA actions run.
- **Implementation:** `millaEnabled()` in liveIntegration; `onGift` returns null when `!millaEnabled()`.
- **API:** `GET /live/milla/status/:streamId` — returns `{ coHost, muted, millaEnabled }`.

## Validation

- **Force mute works:** When stream is force-muted, `emitHook('out', { streamId })` does not run registered hooks; when unmuted, it does. Unit tests in `packages/milla/src/liveIntegration.test.js`.
- **Kill-switch works:** When `MILLA_ENABLED=false`, `onGift(streamId, gift)` returns null and no reaction is logged. Unit tests in same file.

Run: `node --test packages/milla/src/liveIntegration.test.js` or `npm run validate:phase5.6`.

---

*Phase 5.6 complete. Proceed to next phase in specified order.*
