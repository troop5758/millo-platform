# AI upgrade path — Phase 3.x (trust, safety, moderation)

Product roadmap and execution checklist for moderation, fraud, trust, and enforcement.  
Production domain: `https://milloapp.com`

---

## Phased capability model

### Phase 3.1 (NOW) — Keyword + rules

- **Text:** Keyword / rule-based checks in the Kafka moderation worker (`packages/workers/moderation/ai.js` — `BANNED_WORDS`, `moderateText`).
- **API path:** Live chat also uses synchronous filters (`packages/api/src/services/moderation/chatFilter.js`, optional Milla path).
- **Goal:** Deterministic, fast, no external AI dependency.

### Phase 3.2 — LLM moderation (chat + captions)

- **Target:** Replace or augment `moderateText` with an LLM or vendor moderation API; extend to upload **captions** via same worker topic `uploads` (`packages/workers/moderation.worker.js`).
- **Existing hook:** `packages/api/src/services/aiModeration.service.js` (OpenAI / Hive / Rekognition when `AI_MODERATION_ENABLED=true`) for admin/scan flows — align worker text path with this when ready.

### Phase 3.3 — Vision AI (video frames)

- **Target:** Implement `sampleFrames` (FFmpeg → buffers or S3 keys) and run NSFW/violance models on `live-video-frames` / upload video.
- **Current state:** `sampleFrames` is a **stub** (returns `[]`); worker calls it but vision scores are not production-active until implemented.

### Phase 3.4 — Behavioral AI (fraud prediction)

- **Target:** Continuous risk from behavior (sessions, payments, gifts, graph signals) feeding enforcement.
- **Existing pieces:** `packages/api/src/services/fraud.service.js`, `packages/api/src/services/riskEngine.js`, bot detection queue (`packages/api/src/workers/botDetectionWorker.js`), ML worker stubs as configured in repo.

---

## Final execution checklist

Use this as a go-live verification list. Status reflects **code present**; production still requires correct **env**, **Kafka**, **workers**, and **credentials**.

### Moderation

| Item | Status | Where |
|------|--------|--------|
| Chat moderation working | 🟢 Path exists | REST + WS: `packages/api/src/routes/live.js`, `packages/api/src/sockets/liveChat.socket.js`; filters + optional Milla; Kafka fan-out `packages/api/src/lib/liveEventsKafka.js` |
| Video frame sampling active | 🟡 Stub | `packages/workers/moderation/ai.js` `sampleFrames` → implement FFmpeg + model for 🟢 |
| Kafka pipeline connected | 🟢 When enabled | Topics: `kafkaEventBus` `CHAT_MESSAGES` / `MODERATION_RESULTS`; worker `packages/workers/moderation.worker.js`; consumer `packages/api/src/workers/moderationResultsEnforcementConsumer.js` |

**Env (typical):** `KAFKA_ENABLED=true`, `MODERATION_KAFKA_WORKER=true`, `MODERATION_RESULTS_ENFORCEMENT` not `false`, brokers set.

### Fraud

| Item | Status | Where |
|------|--------|--------|
| Risk scoring active | 🟢 | `fraud.service.js`, `riskEngine.js`, device/creator reputation services as wired |
| Payment blocking enabled | 🟢 When gate on | `enforceFraudPolicyGate` in `packages/api/src/routes/payments.js`; disable with `FRAUD_POLICY_GATE=false` |

### Trust

| Item | Status | Where |
|------|--------|--------|
| Trust score calculated | 🟢 | `packages/api/src/services/trust.service.js` `calculateTrust`; admin: `GET /admin/users/:id/trust` in `packages/api/src/routes/moderation.js` |
| Graph relationships stored | 🟢 | Mongo `TrustGraphLink`; optional Neo4j dual-write in `trust.service.js` |

### Enforcement

| Item | Status | Where |
|------|--------|--------|
| Auto-ban / warn working | 🟢 | Policy: `packages/api/src/services/enforcement.service.js`; persist: `packages/api/src/services/enforcementEngine.js`; pipeline: `moderationResultsEnforcementConsumer.js` |
| Shadowban logic implemented | 🟢 | `enforcementEngine.reduceReach` (User + Profile + Moderation doc); `moderationService.isShadowBanned` consumers |

### Admin

| Item | Status | Where |
|------|--------|--------|
| Moderation dashboard live | 🟢 API | `GET /admin/moderation/flags`, `POST /admin/moderation/flags/:id/action`, `POST /admin/ban`, trust endpoint — `packages/api/src/routes/moderation.js`; web: `packages/web/src/pages/ModeratorPage.jsx` (consume APIs as needed) |
| Audit logs visible | 🟢 Admin audit | `GET /dashboards/admin/audit-logs` — `packages/api/src/routes/dashboards.js` |
| General `AuditLog` stream | 🟢 Written | `writeAuditLog` — enforcement + moderation + payments; query via DB or add a dedicated admin list route if product requires it |

---

## Quick reference — primary files

| Area | Files |
|------|--------|
| Worker moderation | `packages/workers/moderation.worker.js`, `packages/workers/moderation/ai.js` |
| Kafka topics | `packages/api/src/services/kafkaEventBus.js` |
| Enforcement | `packages/api/src/services/enforcementEngine.js`, `enforcement.service.js` |
| Fraud / payments gate | `packages/api/src/services/fraud.service.js`, `packages/api/src/routes/payments.js` |
| Trust | `packages/api/src/services/trust.service.js`, `packages/database/src/schemas/TrustGraphLink.js` |
| Audit | `packages/database/src/schemas/AuditLog.js`, `packages/database/src/auditWrites.js`, `packages/api/src/services/auditLog.js` |

This document is the **Phase 3.x AI upgrade path** reference; it does not replace phase docs in `docs/phase-*.md` for other platform phases.
