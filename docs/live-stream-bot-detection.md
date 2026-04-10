# Live Stream Bot Detection

Detects bot-like activity on live streams using viewer and chat signals. When thresholds are exceeded, the stream is flagged for review and a `FraudEvent` is created.

## Signals

| Signal | Description | Threshold |
|--------|-------------|-----------|
| **Viewer join rate** | Joins per minute in a short window | > 120/min (configurable) |
| **Viewers with zero watch time** | High ratio of viewers who left within 5s of joining | ≥ 70% of recent joins, with ≥ 10 total joins |
| **Identical join times** | Many joins in the same second (automated) | ≥ 25 joins in one second |
| **Chat spam** | Same user many messages in 2 min, or many identical messages | ≥ 15 messages per user, or ≥ 5 duplicate texts with ≥ 10 messages |

## Example

```js
if (viewerJoinRate > threshold) flagStream(streamId);
```

When a viewer joins, the API checks the current viewer join rate; if it exceeds the threshold, `flagStream(streamId)` runs (fire-and-forget) and evaluates all signals. If any signal is suspicious, the stream is flagged and a `FraudEvent` with `eventType: 'viewer_spike'` and `meta.live_bot_signals` is created.

## Service

**`packages/api/src/services/liveStreamBotDetection.js`**

- **`flagStream(streamId)`** — Runs all checks; returns `{ flagged, signals, viewerJoinRate, zeroWatch, identicalJoin, chatSpam }`. When `flagged`, creates a `FraudEvent`.
- **`getViewerJoinRate(streamId, windowMs)`** — Returns `{ count, ratePerMinute }`.
- **`getZeroWatchTimeSignal(streamId)`** — Returns zero-watch ratio and `suspicious` flag.
- **`getIdenticalJoinTimesSignal(streamId)`** — Returns max joins in same second and `suspicious` flag.
- **`getChatSpamSignal(streamId)`** — Returns per-user and duplicate message stats and `suspicious` flag.
- **`getViewerJoinRateThreshold()`** — Returns the join-rate threshold (for use in join flow).

## Integration

- **Viewer join:** After a viewer joins (`POST /live/stream/:streamId/join`), the service checks `getViewerJoinRate(streamId)`. If `ratePerMinute > getViewerJoinRateThreshold()`, `flagStream(streamId)` is invoked in the background.
- **Admin:** **GET /admin/streams/:streamId/bot-check** and **GET /dashboards/admin/streams/:streamId/bot-check** run `flagStream(streamId)` and return the result. Admin only.

## Config (env)

- `LIVE_BOT_JOIN_RATE_THRESHOLD` — default 120 (joins per minute)
- `LIVE_BOT_JOIN_WINDOW_MS` — default 60000 (1 min)
- `LIVE_BOT_ZERO_WATCH_SEC` — default 5 (left within this many seconds = zero watch)
- `LIVE_BOT_ZERO_WATCH_RATIO` — default 0.7 (70% zero-watch = suspicious)
- `LIVE_BOT_IDENTICAL_JOIN_THRESHOLD` — default 25 (joins in same second)
- `LIVE_BOT_CHAT_SPAM_MSGS` — default 15 (messages per user in 2 min)

## References

- [bot-types-and-detection.md](bot-types-and-detection.md) — Live viewer bots
- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Detection layer
- `packages/api/src/services/liveStreamBotDetection.js`
- `packages/api/src/routes/live.js` — viewer join triggers check
- `packages/api/src/services/fraudService.js` — `detectViewerSpike` (spike-only)
