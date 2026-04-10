# Anti-Bot System Architecture for Millo

Production platforms use **5 detection layers simultaneously**. This document maps that architecture to Millo’s implementation and identifies gaps.

## Architecture overview

```
Client Layer
   │
   ├── Device Fingerprint
   ├── Behavioral telemetry
   │
API Gateway
   │
   ├── Rate limit engine
   ├── Risk scoring engine
   │
Detection Layer
   │
   ├── Behavior AI
   ├── Graph analysis
   ├── Anomaly detection
   │
Action Layer
   │
   ├── Shadow ban
   ├── Rate throttle
   ├── CAPTCHA challenge
   └── Permanent ban
```

---

## 1. Client Layer

| Component | Purpose | Millo implementation |
|-----------|---------|----------------------|
| **Device Fingerprint** | Identify device across sessions; detect multi-account and bot farms. | **Implemented.** TikTok-style: FingerprintJS `visitorId` + userAgent, screen, timezone. `POST /security/device` and `POST /fraud/track`; `DeviceFingerprint` schema (visitorId, timezone, screenResolution, meta). See [device-fingerprinting.md](device-fingerprinting.md) and [phase-11-fraud-prevention.md](phase-11-fraud-prevention.md). |
| **Behavioral telemetry** | Client-side signals (scroll, dwell, click patterns) to distinguish humans from scripts. | **Implemented.** `trackBehavior(eventType, metadata)` → `POST /security/behavior`; `BehaviorEvent` schema. See [behavioral-ai-detection.md](behavioral-ai-detection.md). |

---

## 2. API Gateway

| Component | Purpose | Millo implementation |
|-----------|---------|----------------------|
| **Rate limit engine** | Throttle requests per IP/key to stop brute force and scraping. | **Implemented.** `@fastify/rate-limit` with config from `@millo/security` (`getRateLimitConfig()` → `RATE_LIMIT_MAX`, `RATE_LIMIT_TIME_WINDOW_MS`). Per-route overrides on auth, payments, gifts, DMs, reports, etc. See `packages/api/src/app.js`, `packages/security/src/rateLimit.js`. |
| **Risk scoring engine** | Score each request (or user) before or during processing; gate high-risk actions. | **Implemented.** `fraudService.evaluatePayment()`, `evaluateGiftRisk()`; **Bot risk:** `riskEngine.calculateRisk(userId)` (likes/min, device reuse, identical comments, no mouse movement, new-account mass follows). See [bot-risk-scoring-engine.md](bot-risk-scoring-engine.md). Admin: GET /admin/risk/:userId. |

---

## 3. Detection Layer

| Component | Purpose | Millo implementation |
|-----------|---------|----------------------|
| **Behavior AI** | ML/moderation on content and behavior (e.g. spam, abuse, bot-like patterns). | **Partial.** Behavioral telemetry collected via `POST /security/behavior` (scroll, video_watch, like, etc.); AI moderation for content. No dedicated ML model for bot classification yet—use event streams for anomaly detection (identical intervals, high volume). See [behavioral-ai-detection.md](behavioral-ai-detection.md). |
| **Graph analysis** | Link accounts and devices (same IP, same fingerprint, gift/engagement rings). | **Implemented.** `botGraphDetection.detectBotCluster(userId)` — same device/IP/same-day clusters, rapid interactions, in-cluster ratio. Feeds into risk score as `bot_cluster`. See [bot-graph-detection.md](bot-graph-detection.md). |
| **Anomaly detection** | Flag unusual volumes, amounts, or patterns. | **Implemented.** Financial: `anomalyService.detectAnomalies()` (large amounts, velocity, chargebacks). Live: `fraudService.detectViewerSpike()`. Sound: fraud score from bot views, adoption, loop rate. See `packages/api/src/services/anomalyService.js`, fraud worker flows. |

---

## 4. Action Layer

| Component | Purpose | Millo implementation |
|-----------|---------|----------------------|
| **Shadow ban** | User appears normal but reach/visibility and monetization are reduced. | **Implemented.** `Moderation` schema (reason, expiresAt); feed ranking × 0.05; comments from shadow-banned users hidden; User/Profile synced. See [shadow-banning-system.md](shadow-banning-system.md). Admin: POST /dashboards/mod/shadow-ban. |
| **Rate throttle** | Stricter limits for suspicious users (e.g. lower gift/payment caps). | **Partial.** Gift velocity and risk-based caps (e.g. `GIFT_VELOCITY_LIMIT_HIGH_RISK`) in fraud service. No generic “throttle tier” per user/IP. Extend with: per-user or per-fingerprint throttle multipliers. |
| **CAPTCHA challenge** | Challenge suspicious traffic before allowing sensitive actions. | **Implemented.** When risk score > 70, require CAPTCHA; providers: Cloudflare Turnstile, hCaptcha, Arkose Labs. Used on login and gift send. See [captcha-challenge-system.md](captcha-challenge-system.md). |
| **Permanent ban** | Remove account and block access. | **Implemented.** User status (e.g. `banned`), moderation state; admin tools to suspend/ban. DMCA repeat-infringer and ToS enforcement. |

---

## Data flow (summary)

1. **Client** sends fingerprint (and optionally behavioral events) → stored and used in risk and graph signals.
2. **API Gateway** applies global and per-route rate limits; high-value actions call **risk scoring** (payment, gift, etc.).
3. **Detection Layer** runs rule-based and anomaly checks (payments, viewers, sounds); can be extended with behavior AI and graph analysis.
4. **Action Layer** applies shadow ban, throttle, CAPTCHA (when implemented), or ban based on policy and risk.

---

## Related docs

- [bot-types-and-detection.md](bot-types-and-detection.md) — 12 bot types and which signals each layer must feed.
- [phase-11-fraud-prevention.md](phase-11-fraud-prevention.md) — Fraud signals, device fingerprint, FraudEvent.
- **Implementation:** `packages/api/src/services/fraudService.js`, `packages/security/src/rateLimit.js`, `packages/api/src/app.js`, `packages/workers/src/lib/soundFraud.js`, `packages/api/src/services/anomalyService.js`.
