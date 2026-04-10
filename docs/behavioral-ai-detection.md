# Behavioral AI Detection

TikTok-style signals to distinguish human interaction from bots. The backend stores behavior events; downstream analytics or ML can detect patterns (e.g. identical intervals = bot, irregular scrolling = human).

## Human signals

- Irregular scrolling
- Pauses on videos
- Variable typing speed
- Random click timing

## Bot signals

- Perfectly timed actions
- Identical intervals
- High volume activity
- No mouse movement

## React telemetry

Use `trackBehavior(eventType, metadata)` from `lib/behaviorTelemetry.js`. Sends to `POST /security/behavior` (fire-and-forget, with auth when logged in).

```js
import { trackBehavior } from '../lib/behaviorTelemetry';

trackBehavior('video_watch', { videoId });
trackBehavior('like', { videoId });
trackBehavior('scroll', { position });
```

## Backend

- **Schema:** `BehaviorEvent` — `userId` (optional), `eventType`, `metadata`, `timestamp`, `sessionId` (optional).
- **Endpoint:** `POST /security/behavior` — Body: `{ eventType, metadata?, timestamp? }`. Auth optional (userId set when token present). Rate limit: 120/minute.
- **Indexes:** `userId + timestamp`, `eventType + timestamp` for analytics and anomaly detection.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Detection Layer (Behavior AI)
- `packages/web/src/lib/behaviorTelemetry.js` — Client
- `packages/api/src/routes/security.js` — POST /security/behavior
- `packages/database/src/schemas/BehaviorEvent.js` — Schema
