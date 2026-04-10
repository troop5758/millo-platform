# Enterprise-Grade Protection Stack (Anti-Bot Architecture)

Full anti-bot and fraud-protection architecture for Millo, aligned with patterns used by platforms like TikTok, Twitch, and YouTube. All behaviour bound to **https://milloapp.com**.

---

## Millo Anti-Abuse Enterprise Architecture

```
                    ┌───────────────────────────┐
                    │        CLIENT LAYER       │
                    │                           │
                    │  Web / Mobile / Desktop   │
                    │                           │
                    │  • Device fingerprint     │
                    │  • Behavior telemetry     │
                    │  • Session metadata       │
                    │  • Interaction events     │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │        API GATEWAY        │
                    │                           │
                    │  Fastify / Node.js        │
                    │                           │
                    │  • Authentication         │
                    │  • Session validation     │
                    │  • Rate limiting          │
                    │  • CAPTCHA challenge      │
                    │  • Risk lock check        │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │        EVENT BUS          │
                    │                           │
                    │  Kafka / Redis Streams    │
                    │                           │
                    │ Topics:                   │
                    │  • user_activity          │
                    │  • auth_events            │
                    │  • live_events             │
                    │  • payment_events         │
                    │  • moderation_events      │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
          ┌─────────────────────────────────────────────────┐
          │            REAL-TIME DETECTION WORKERS          │
          │                                                 │
          │  Bot Detection Worker                           │
          │  • engagement spikes                            │
          │  • like/comment velocity                        │
          │                                                 │
          │  ATO Detection Worker                           │
          │  • impossible travel                            │
          │  • device reputation                            │
          │                                                 │
          │  Fraud Detection Worker                         │
          │  • gift loops                                   │
          │  • auction abuse                                │
          │  • payment anomalies                            │
          │                                                 │
          │  Behavior Analysis Worker                       │
          │  • human interaction signals                    │
          │  • scroll / typing / watch patterns             │
          └─────────────┬───────────────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────────────────────┐
          │            RISK ENGINE                  │
          │                                         │
          │  Aggregates scores from:                │
          │                                         │
          │  • Bot risk score                       │
          │  • Trust score                          │
          │  • Fraud score                          │
          │  • Device reputation                    │
          │                                         │
          │  Calculates unified:                    │
          │                                         │
          │  USER RISK SCORE                        │
          └─────────────┬───────────────────────────┘
                        │
                        ▼
          ┌─────────────────────────────────────────┐
          │           ENFORCEMENT ENGINE            │
          │                                         │
          │  Score → Action mapping                 │
          │                                         │
          │  20 → CAPTCHA                           │
          │  40 → Rate limit                        │
          │  60 → Shadow ban                        │
          │  80 → Manual review                     │
          │  90 → Permanent ban                     │
          │                                         │
          │  Actions applied across:                │
          │  • Feed ranking                         │
          │  • Comment visibility                   │
          │  • Live stream discovery                │
          │  • Messaging                            │
          │  • Payments                             │
          └─────────────┬───────────────────────────┘
                        │
                        ▼
       ┌──────────────────────────────────────────────┐
       │              DATA LAYER                      │
       │                                              │
       │ MongoDB                                      │
       │  • TrustScore                                │
       │  • TrustHistory                              │
       │  • BehaviorEvents                            │
       │  • LoginAudit                                │
       │  • FraudEvents                               │
       │                                              │
       │ Redis                                        │
       │  • rate limits                               │
       │  • risk flags                                │
       │                                              │
       │ Neo4j (optional future)                      │
       │  • bot clusters                              │
       │  • social graph                              │
       └─────────────┬────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────┐
       │          MACHINE LEARNING LAYER              │
       │                                              │
       │ Python Workers / TensorFlow / PyTorch        │
       │                                              │
       │ Models:                                      │
       │                                              │
       │  • Isolation Forest                          │
       │      anomaly detection                       │
       │                                              │
       │  • Random Forest                             │
       │      bot classification                      │
       │                                              │
       │  • LSTM                                      │
       │      behavior sequence analysis              │
       │                                              │
       │  • Graph Neural Networks                     │
       │      bot farm detection                      │
       └─────────────┬────────────────────────────────┘
                     │
                     ▼
       ┌──────────────────────────────────────────────┐
       │            ADMIN INTELLIGENCE                │
       │                                              │
       │ Admin Dashboard                              │
       │                                              │
       │  • suspicious account alerts                 │
       │  • bot cluster visualization                 │
       │  • trust score timeline                      │
       │  • login geo history                         │
       │  • fraud review queue                        │
       │                                              │
       │ Moderation tools                             │
       │                                              │
       │  • ban / shadow ban                          │
       │  • remove risk lock                          │
       │  • request verification                      │
       │  • resolve fraud case                        │
       └──────────────────────────────────────────────┘
```

---

## How This Protects Millo

This architecture protects all critical platform features.

| Feature | Detection |
|---------|-----------|
| **Short videos** | View bots, like farms, comment spam |
| **Live streaming** | Fake viewers, chat spam, engagement manipulation |
| **Creator monetization** | Gift loops, subscription fraud, payout abuse |
| **Marketplace / auctions** | Fake bidders, payment manipulation, seller scams |

### Detection Layers Used

Millo uses **6 simultaneous detection layers** — the same layered strategy used by large social platforms.

| Layer | Purpose |
|-------|---------|
| Device fingerprinting | Identify devices beyond cookies |
| Behavior analytics | Detect bots via scroll, typing, mouse, session patterns |
| Graph analysis | Detect bot farms (clusters, gift rings, follow circles) |
| Trust score system | User reputation 0–100; risk levels |
| Fraud detection | Payment protection (velocity, loops, refund abuse) |
| Machine learning | Anomaly detection (shadow / Python workers) |

### Key Protection Systems Implemented

- **Account takeover protection** — Impossible travel detection, device reputation, risk lock, step-up verification.
- **Bot detection** — Engagement velocity, interaction patterns, bot cluster detection (MongoDB + optional Neo4j).
- **Fraud detection** — Gift loops, payment velocity, refund abuse, multi-account signals.
- **Enforcement system** — Unified enforcement engine, shadow banning, per-user rate limits, CAPTCHA, manual review.

### Final Result

After implementing this architecture, Millo has **enterprise-level abuse protection** comparable to major platforms.

**Security capabilities:**

- Device fingerprinting  
- Account takeover detection  
- Behavior biometrics  
- Bot farm detection  
- Fraud detection  
- Trust score system  
- Shadow banning  
- AI anomaly detection  
- Manual moderation workflow  

---

## Stack Overview

| Layer | Component | Purpose |
|-------|-----------|---------|
| **Edge** | Cloudflare Bot Management | DDoS, bot traffic filtering, challenge at edge |
| **Client** | FingerprintJS (Pro) | Device fingerprinting, visitorId for server |
| **API** | Redis rate limiting | Per-key limits shared across API instances |
| **API** | Client telemetry | Device + behavior events (POST /security/device, /security/behavior) |
| **Backend** | Risk scoring engine | Bot risk score from signals (riskEngine) |
| **Backend** | Graph cluster detection | Same device/IP, rapid interactions, same-day signups (botGraphDetection) |
| **Backend** | Behavior analytics | BehaviorEvent store; scroll, like, watch, no-mouse detection |
| **Backend** | AI anomaly detection | Shadow-mode; scores sessions when enabled, no auto-apply |
| **Enforcement** | CAPTCHA challenge | Turnstile / hCaptcha / Arkose; requireCaptchaRedis |
| **Enforcement** | Shadow banning | Automated + manual; gifts/content hidden, revenue blocked |
| **Admin** | Security dashboard | Suspicious accounts, bot clusters, risk scores, live alerts |

---

## Concept: Adaptive Risk Engine

**Traditional moderation:** static rules → fixed detection.

**Adaptive moderation:** rules + ML models + feedback loop. The system continuously learns from:

| Input | Role in adaptation |
|-------|---------------------|
| **Moderation decisions** | Human approve/reject/override feeds back into labels and model retraining (e.g. manual review outcomes). |
| **New fraud patterns** | Graph and event-based detection surface new clusters; rules and ML can be extended or retrained on these patterns. |
| **User reports** | Reports and appeal outcomes improve abuse classifiers and reduce false positives. |
| **Enforcement results** | Outcomes of CAPTCHA, shadow ban, payout hold, and ban inform threshold tuning and model calibration. |

**ML model types:** Adaptive moderation uses multiple models; each targets a different abuse type:

| Model | Purpose |
|-------|---------|
| **Isolation Forest** | Anomaly detection |
| **Random Forest** | Bot classification |
| **LSTM** | Behavior sequences |
| **Graph Neural Network** | Fraud networks |
| **Gradient Boosting** | Engagement fraud |

Today Millo uses **rule-based risk engine + Trust Graph + (optional) Neo4j + enforcement**; Phase 6 adds **ML workers** (Isolation Forest, Random Forest, GNN, LSTM, Gradient Boosting) and a path to close the loop (e.g. Kafka topics for moderation/enforcement outcomes, Python pipelines for retraining, and configurable thresholds). The Adaptive Risk Engine is the target architecture: static rules for interpretability and safety, ML for pattern discovery, and feedback so the system improves over time.

**Architecture (target — self-improving loop):**

```
User Activity
      │
      ▼
Event Pipeline (Kafka)
      │
      ▼
Detection Workers
      │
      ▼
Risk Engine
      │
      ▼
Adaptive AI Layer
      │
      ▼
Self-Learning Models
      │
      ▼
Updated Detection Rules
      │
      ▼
Enforcement Engine
```

The system becomes self-improving over time: enforcement outcomes and moderation decisions feed back (e.g. via Kafka or batch) into the Adaptive AI Layer; self-learning models retrain or recalibrate; updated rules and thresholds flow back into the Risk Engine and Detection Workers.

**Model training pipeline:** Offline/scheduled flow that produces deployable models:

```
Training Data
     │
     ▼
Feature Engineering
     │
     ▼
Model Training
     │
     ▼
Model Validation
     │
     ▼
Model Deployment
```

- **Training Data:** ModerationTrainingData (labeled), MlFeatureSnapshot (features from events), FraudEvent, moderation outcomes.
- **Feature Engineering:** Build/refresh feature vectors (viewVelocity, deviceCluster, trustScore, engagementRatio, graph signals, etc.); join with labels.
- **Model Training:** Train Isolation Forest, Random Forest, LSTM, GNN, Gradient Boosting on the prepared dataset.
- **Model Validation:** Holdout evaluation, precision/recall, calibration; gate deployment on metrics.
- **Model Deployment:** New model versions published (e.g. to object store or model server); Node/workers consume via `ML_RISK_SERVICE_URL` or Kafka `ml_risk_scores`.

This pipeline should run **periodically** (e.g. daily or weekly) so models stay current with new fraud patterns and moderator feedback. Example training script: **ml/train_bot_model.py** (RandomForestClassifier on viewVelocity, deviceCluster, trustScore, engagementRatio; outputs `bot_model.pkl`). Requires `training_data.csv` (export from ModerationTrainingData or feature pipeline); run from `ml/` with `pip install -r requirements.txt`.

**Adaptive Rule Generator:** The system can automatically update detection rules when models surface new patterns. Example flow:

1. **Model identifies new fraud pattern:** e.g. high `giftVelocity` + large `deviceCluster` + low `trustScore` (from feature importance, clustering, or anomaly signals).
2. **New rule generated:** e.g. `(giftVelocity > threshold) AND (deviceCluster > threshold) → fraud`.
3. **Rules flow into Risk Engine / Detection Workers:** thresholds or rule definitions (config, DB, or code) are updated so the same logic runs in production without waiting for the next model deploy.

Example rule shape:

| Condition | Threshold (example) | Action |
|-----------|--------------------|--------|
| giftVelocity > _t1_ | _t1_ = 50/min | AND |
| deviceCluster > _t2_ | _t2_ = 10 accounts | → flag fraud |

Implementation options: (a) **interpretable models** (e.g. decision trees, rule lists) from which rules are extracted; (b) **rule-mining** on high-risk clusters (e.g. find feature ranges that correlate with moderator-confirmed fraud); (c) **human-in-the-loop:** model suggests candidate rules, moderator approves before they go live. The Adaptive Rule Generator is the component that turns model output into updated, deployable rules (e.g. env-driven thresholds or a rule store consumed by the risk engine).

**Shadow mode model testing:** Before activating a new model in production:

1. **Model runs silently** — Predictions are computed but not used for enforcement (no auto-flag, no CAPTCHA, no ban).
2. **Predictions logged** — Each prediction (e.g. riskProbability, suggested label) is stored with context (userId, contentId, features, timestamp) for later comparison.
3. **Compared with moderator decisions** — When moderators resolve cases (true fraud / false positive), outcomes are joined with the logged predictions to compute accuracy, precision, recall, and false-positive rate.
4. **If accuracy is high** — Model is promoted from shadow to **active**: its output is used by the risk engine, mlPredictionWorker, or enforcement; otherwise it stays in shadow until retrained or tuned.

This avoids bad models affecting users; existing **AI anomaly detection** already runs in shadow mode (scores visible on dashboard, no auto-apply). New ML models (bot classification, fraud, etc.) should follow the same pattern: deploy in shadow, log predictions, evaluate against moderation outcomes, then activate when metrics meet a gate (e.g. precision > 0.85, recall > 0.7).

**Continuous learning loop:** The adaptive system forms a closed cycle so detection keeps improving:

```
Platform Events
      ↓
Feature Extraction
      ↓
ML Predictions
      ↓
Moderation Decisions
      ↓
Training Dataset
      ↓
Model Retraining
      ↓
Improved Detection
```

- **Platform events** (gifts, logins, likes, content, payments) feed the pipeline.
- **Feature extraction** (featureGeneratorWorker, MlFeatureSnapshot, graph signals) produces vectors for each entity/event.
- **ML predictions** (mlInferenceService, shadow or active models) output risk scores; high-risk cases go to review.
- **Moderation decisions** (Creator Review Queue, report resolution, manual review) yield labels (fraud / not fraud, etc.).
- **Training dataset** (ModerationTrainingData, labeled snapshots) grows with every decision.
- **Model retraining** (scheduled pipeline: train → validate → deploy) updates models on the new data.
- **Improved detection** — New model version is deployed (or kept in shadow until metrics pass); the loop repeats.

The system never stops improving: more events → more features → more predictions → more moderator feedback → richer training data → better models → better detection.

**AI-assisted moderator tools:** Moderators see aggregated risk and explanations so they can act quickly and consistently.

| What moderators see | Source |
|---------------------|--------|
| **Risk score** | Unified 0–100 from riskEngine, creator fraud score, or ML riskProbability |
| **Model explanation** | Which signals contributed (e.g. device_cluster, high_likes_per_minute, neo4j_gift_ring) |
| **Suspicious patterns** | Graph clusters, gift rings, engagement velocity, trend hijacking, ATO signals |

**Example UI — User Risk Profile:**

```
User Risk Profile

Risk Score: 87
Reason:
 - device cluster
 - abnormal engagement velocity
 - suspicious gift loop
```

Data for this view can be built from: **riskEngine.calculateRisk(userId)** → `{ score, signals }`; **neo4jClusterService.getClusterSignals(userId)** → gift ring, account cluster, like farm; **creatorReputationService.getCreatorReputation(creatorId)** and **getCreatorFraudGraphSignals(creatorId)** for creators; **security dashboard** (riskScores, aiAnomalyScores); **GET /moderation/creator-fraud-graph/:creatorId**. The admin dashboard (or a dedicated “User Risk Profile” panel) should display risk score, a human-readable list of reasons derived from `signals` and graph/ML flags, and links to Creator Review Queue, trust timeline, and enforcement actions.

**Explainable AI (important):** Moderators must understand **why** the AI flagged a case. Without explanations, trust in automation drops and appeal handling is harder.

- **What to expose:** Fraud (or risk) probability plus **top contributing factors** (feature names and, if available, direction or magnitude).
- **Example explanation:**

  ```
  fraud probability: 0.91

  Top factors:
   - deviceClusterSize
   - engagementVelocity
   - lowTrustScore
  ```

- **Implementation:** Rule-based risk (riskEngine) already returns `signals` (e.g. `device_reuse`, `high_likes_per_minute`, `neo4j_gift_ring`). For ML models, use **interpretable models** (e.g. decision trees, linear models, or tree-based feature importance) so the pipeline can return a short list of top factors (e.g. `deviceClusterSize`, `engagementVelocity`, `trustScore`). The ML inference service or prediction worker should return not only `riskProbability` but also `topFactors` or `explanation` when available; the moderator UI then shows both score and factors. Storing explanations alongside logged predictions (shadow mode) also helps when comparing model output to moderator decisions.

**Model monitoring:** Track model performance so quality and latency stay within bounds.

| Metric | Purpose |
|--------|---------|
| **precision** | Fraud detection accuracy — of cases the model flagged as fraud, how many were confirmed by moderators |
| **recall** | Detection coverage — of all confirmed fraud cases, how many the model flagged |
| **false positive rate** | User safety — how often legitimate users are incorrectly flagged; keep low to avoid wrongful restrictions |
| **latency** | Inference speed — time to compute risk score; keep low so real-time flows (e.g. login, gift) are not delayed |

Compute precision/recall/false-positive rate by joining **logged predictions** (shadow or active) with **moderation outcomes** (ModerationTrainingData, Creator Review Queue resolutions, report outcomes). Latency can be measured at the ML inference service or at POST /ml/predict-risk. Dashboards and alerts should surface these metrics; degrade to heuristic or pause auto-enforcement if precision drops or latency exceeds a threshold.

**Fail-safe system:** If ML fails (service down, timeout, error, or metrics breach), **fallback → rule engine**. The platform must remain safe and responsive.

- **Behavior:** When the ML inference service is unreachable or returns an error, POST /ml/predict-risk and mlInferenceService already fall back to the **heuristic** risk score. The risk engine (riskEngine.calculateRisk) does not depend on ML; it uses rule-based signals (likes/min, device reuse, bot cluster, Trust Graph signals). So even with ML disabled or failing, detection and enforcement continue via rules.
- **Operational rule:** Prefer the rule engine as the default path; treat ML as an enhancement. If ML is active and its output is merged into totalRisk, ensure that on ML failure or timeout the pipeline uses only rule-based scores (and optionally cached or last-known ML score) so enforcement still runs. This ensures platform safety.

**20. Final Adaptive Moderation Architecture**

End-to-end flow combining events, ML, rules, enforcement, and the learning loop:

```
User Activity
      │
      ▼
Kafka Event Stream
      │
      ▼
Feature Extraction
      │
      ▼
ML Risk Prediction
      │
      ▼
Risk Engine
      │
      ▼
Enforcement Engine
      │
      ▼
Moderator Review
      │
      ▼
Training Dataset
      │
      ▼
Model Retraining
```

**Final result:** After implementing this layer, Millo becomes extremely difficult to exploit.

The system will detect:

- Bot farms  
- Fake engagement  
- Trend manipulation  
- Gift rings  
- Creator fraud  
- Account takeover networks  
- Coordinated abuse  

Even when attackers change tactics, the AI learns and adapts: new patterns feed into the training dataset, models retrain, and detection improves. Together with the Trust Graph, fail-safe rules, and moderator tools, this forms the full adaptive moderation architecture.

---

## Concept: Global Trust Graph

Instead of storing relationships only in tables, the system builds a **graph of platform activity**. This allows detection of suspicious clusters and rings that table-based queries would miss.

**Example — device cluster:**

```
User A ── uses ── Device X
User B ── uses ── Device X
User C ── uses ── Device X
```

**Result:** 3 accounts → same device → suspicious cluster.

**Expanded graph example — gift fraud ring:**

```
User A ── posts ── Video 1
User B ── likes ── Video 1
User C ── likes ── Video 1

User A ── receives gift ── from User B
User B ── receives gift ── from User C
User C ── receives gift ── from User A
```

This reveals a **gift fraud ring**: coordinated engagement plus circular gift flow.

**Entities in the Trust Graph (node types):**

| Node Type   | Example                    |
|------------|----------------------------|
| **User**   | Creator or viewer          |
| **Device** | Browser/device fingerprint |
| **IP**     | Network address            |
| **Content**| Video or livestream        |
| **Payment**| Card / Stripe / PayPal     |
| **Transaction** | Gift / payment          |
| **Session**| Login session              |
| **Hashtag**| Trending topic             |

**Graph relationships (edge types):**

| Relationship   | Meaning                        |
|----------------|--------------------------------|
| **USES_DEVICE**| User logged in with device     |
| **LOGGED_FROM**| Session → IP                   |
| **POSTED**     | Creator uploaded content       |
| **LIKED**      | Engagement                     |
| **COMMENTED**  | Comment interaction            |
| **GIFTED**     | Gift transaction               |
| **PAID**       | Subscription / payment         |
| **BID_ON**     | Auction interaction            |
| **FOLLOWS**    | Social relationship            |

**Graph database (Neo4j) for trust graph:**

- MongoDB is excellent for document storage but not ideal for **deep relationship analysis** across many hops.
- For rich trust-graph queries (gift rings, device/IP clusters, follow circles), Millo uses **Neo4j** (Phase 6) as the **graph database** backing the Global Trust Graph.
- Canonical mapping (examples):
  - `(User)-[:USES_DEVICE]->(Device)`
  - `(User)-[:LOGGED_FROM]->(IP)`
  - `(User)-[:POSTED]->(Content)`
  - `(User)-[:LIKED]->(Content)`
  - `(User)-[:GIFTED]->(User)`
  - `(User)-[:PAID]->(Creator)`
  - `(User)-[:BID_ON]->(Auction)`

**Trust Graph Risk Scoring:** Graph signals contribute to the risk engine. Example: shared device cluster +40, gift ring +50, fake engagement cluster +30, payment cluster +50. `riskScore = deviceClusterRisk + giftRingRisk + engagementClusterRisk + paymentClusterRisk` (plus other signals). Implemented in `riskEngine.calculateRisk` via `neo4jClusterService.getClusterSignals`; env: `RISK_TRUST_GRAPH_DEVICE_CLUSTER`, `RISK_TRUST_GRAPH_GIFT_RING`, `RISK_TRUST_GRAPH_ENGAGEMENT_CLUSTER`, `RISK_TRUST_GRAPH_PAYMENT_CLUSTER`.

**Graph-Based Creator Fraud Detection:** Graph detects: fake gifts (creator receives from accounts that share a device → self-funding), subscription farms, self-purchases, fake auction bids. Example: Creator A ↑ gifts from B,C,D ↑ all share device → self-funding fraud. Implemented: `neo4jClusterService.getCreatorFraudGraphSignals(creatorId)` (self-funding Cypher); `fraudService.getCreatorFraudScore` applies **CREATOR_GRAPH_SELF_FUNDING_PENALTY** (50) when `selfFundingGifts` is true. Env: `CREATOR_GRAPH_SELF_FUNDING_PENALTY`.

**Graph Ingestion Pipeline:** Activity events update the trust graph in real time. Flow: **User Activity → Kafka Events → Graph Ingestion Worker → Neo4j Trust Graph**. The worker consumes events (e.g. `gift_sent`, `login`, `liked`, `posted`) and writes the corresponding graph relationships (GIFTED, USES_DEVICE, LIKED, POSTED, etc.) to Neo4j. See **docs/phase-6-graph-ml-architecture.md** (§ Graph Ingestion Pipeline) for architecture and example event payloads.

**Implementation:** Today the graph is realized via MongoDB-based clustering and edge aggregation: **§5 Graph Cluster Detection** (`botGraphDetection.getClusterByDevice`, `getClusterByIP`, device/IP clusters), **§14l Gift Ring Detection** (`fraudService` gift graph edges and cycle detection), and optional **Phase 6 Neo4j** (see **docs/phase-6-graph-ml-architecture.md**) for graph-native nodes/edges (User, Device, GIFT_SENT, SAME_DEVICE, etc.) and Cypher-based ring/cluster detection.

---

## 1. Client Telemetry

- **POST /security/device** — Records device fingerprint (visitorId from FingerprintJS), IP, userAgent, timezone, screen. Called by frontend after auth. See `fraudService.recordDevice()`.
- **POST /security/behavior** — Records behavior events: scroll, mousemove, click, video_watch, like, comment, share. Stored in `BehaviorEvent`; used by risk engine for “no mouse movement” and behavior analytics. Rate-limited (120/min).

**Phase:** Phase 11 (fraud), Phase 20 (security routes).

---

## 2. Device Fingerprinting

- **Client:** FingerprintJS (or Fingerprint Pro). Env: `FINGERPRINTJS_PUBLIC_API_KEY` (Pro). See **infra/fingerprintjs.md**.
- **Server:** Accepts `visitorId` on POST /security/device; stored in `DeviceFingerprint` with userId, IP, userAgent. Used for multi-account detection, graph clusters, risk scoring.

---

## 3. Behavior Tracking

- **BehaviorEvent** collection: eventType, userId, metadata, timestamp.
- Risk engine uses: high likes/min, identical comments, no scroll/mouse with high actions (no_mouse_movement), new-account mass follows.
- Behavior endpoint is rate-limited to prevent telemetry abuse.

---

## 4. Risk Scoring Engine

- **Service:** `riskEngine.calculateRisk(userId)` → `{ score, signals }`.
- **Signals:** high_likes_per_minute, identical_comments, device_reuse, no_mouse_movement, new_account_mass_follows, bot_cluster (from graph detection).
- **Enforcement thresholds (env):**  
  - `BOT_ENFORCE_CAPTCHA_THRESHOLD` (default 70) → require CAPTCHA.  
  - `BOT_ENFORCE_SHADOW_BAN_THRESHOLD` (default 80) → shadow ban.  
  - `BOT_ENFORCE_PERMANENT_BAN_THRESHOLD` (default 95) → permanent ban.
- Bot detection worker consumes queue jobs: risk_score_update → captcha_challenge | shadow_ban | permanent_ban.

---

## 5. Graph Cluster Detection

- **Service:** `botGraphDetection.detectBotCluster(userId)`.
- **Signals:** rapid_interactions, same_device_cluster, same_ip_cluster, same_day_signups, mutual_in_cluster.
- Uses Follow, StreamLike, DeviceFingerprint, User; feeds into risk engine (bot_cluster signal).

---

## 6. Rate Limiting

- **Global API:** `@fastify/rate-limit` with config from `@millo/security.getRateLimitConfig()` (max, timeWindow). Optional **Redis store** when `REDIS_HOST` (or `RATE_LIMIT_USE_REDIS=true`) is set for multi-instance limits.
- **NGINX:** limit_req_zone, limit_conn (see Phase 20, infra).
- **Behavior endpoint:** 120 requests/minute per IP (route-level config).

---

## 7. CAPTCHA Challenges

- **Service:** `captchaService`. Providers: Cloudflare Turnstile, hCaptcha, Arkose Labs. Env: `CAPTCHA_PROVIDER`, `CLOUDFLARE_TURNSTILE_SECRET_KEY` / `CLOUDFLARE_TURNSTILE_SITE_KEY`, etc.
- **When required:** Risk score above threshold, or `requireCaptchaRedis` flag set by bot detection worker. Auth/gift routes check `captchaService.requireCaptchaForUser(userId)` and require valid token when true.
- **Verification:** `captchaService.verifyToken(token, remoteip)`.

---

## 8. Shadow Banning

- **Automated:** Bot detection worker sets shadow ban when risk ≥ `BOT_ENFORCE_SHADOW_BAN_THRESHOLD`; writes to Moderation, Profile, User (shadowBanned), AdminAuditLog.
- **Fraud:** `fraudService.applyShadowBanForFraud(userId, opts)` for payment/fraud cases; logged to AdminAuditLog.
- **Effects:** Gifts/content can be hidden, revenue blocked, account monitored (enforced in product logic).

---

## 9. Admin Monitoring Dashboard

- **GET /dashboards/admin/security/dashboard** (admin only). Returns:
  - **suspiciousAccounts** — User IDs with review/block in FraudEvent (last 7 days).
  - **botClusters** — Fingerprints shared by multiple users.
  - **deviceFingerprints** — Total fingerprints, count shared by multiple users.
  - **riskScores** — Risk score + signals for suspicious user IDs.
  - **liveAlerts** — Recent fraud/viewer_spike events (last 24h).
  - **aiAnomalyScores** — When AI anomaly detection is enabled: shadow-mode anomaly scores for suspicious users (no auto-apply).

---

## 10. AI Anomaly Detection (Shadow Mode)

- **Kill-switch:** `AI_ANOMALY_DETECTION_ENABLED` (default off). No auto-application; suggestions/scores for admin only.
- **Service:** `aiAnomalyService`. When enabled, scores sessions/users from behavior + risk signals; results exposed on security dashboard as **aiAnomalyScores**. No automatic CAPTCHA, shadow ban, or ban; admin reviews and acts.

---

## 11. Cloudflare Bot Management

- **Edge:** Bot Fight Mode / Super Bot Fight Mode, WAF rules, rate limiting. See **infra/cloudflare-bot-management.md**.
- Complements in-app rate limiting and CAPTCHA; reduces bad traffic before it hits the API.

---

## 12. Redis Usage

- **Rate limiting:** Optional shared store for @fastify/rate-limit (when Redis configured).
- **Require CAPTCHA:** `requireCaptchaRedis` — keys `require_captcha:{userId}`, TTL 24h, set by bot detection worker.
- **Bot detection queue:** BullMQ `bot-detection` queue (risk_score_update, captcha_challenge, shadow_ban, permanent_ban).

---

## 13. Account Takeover Protection (ATO)

- **LoginAudit:** One record per login (success/failure): userId, ip, country, city, latitude, longitude, deviceFingerprint, userAgent, loginSuccess, createdAt. Used for impossible-travel detection.
- **Geo lookup:** MaxMind GeoLite2-City (optional). Env: `GEOIP_DB_PATH` (default `./GeoLite2-City.mmdb`). Service: `geoService.initGeo()`, `geoService.lookupAsync(ip)` → { country, city, latitude, longitude }.
- **Impossible travel:** `accountTakeoverService.detectImpossibleTravel(userId, newLogin)` — distance > 5000 km and time &lt; 1 hour → risk lock. Env: `ATO_IMPOSSIBLE_TRAVEL_KM`, `ATO_IMPOSSIBLE_TRAVEL_HOURS`.
- **Risk lock:** User model field `riskLock`. When set, sensitive routes return 403 `VERIFICATION_REQUIRED`. Step-up: **POST /auth/verification/send-email** (sends 6-digit OTP), **POST /auth/verification/complete** (body: `{ code }`) clears risk lock. Admin: **POST /moderation/risk-lock/clear** (body: `{ userId, reason? }`).
- **Sensitive routes** (require no risk lock): login response and GET /auth/me include `riskLock`; change-password, gifts/send, payments (coins/intent, coins/confirm, coin-checkout, payouts/request, payouts/withdraw) check `requireNoRiskLock`.

---

## 14. Unified Enforcement Engine (Phase 2)

- **Single entry:** `enforcementEngine.enforce(userId)` computes `totalRisk = max(botScore, fraudScore, 100 - trustScore)` and applies **one** action from the table below.
- **Scores:** `getBotScore` (riskEngine), `getTrustScore` (trustScoreEngine 0–100), `getFraudScore` (max riskScore from FraudEvent in last 30 days).
- **Rules (highest threshold exceeded):** 90 → permanent_ban, 80 → manual_review, 60 → shadow_ban, 40 → rate_limit, 20 → captcha.
- **Worker:** Job type `enforce` runs the engine. `risk_score_update` enqueues `enforce` when `ENFORCEMENT_USE_UNIFIED_ENGINE` ≠ `false`. Legacy job types (captcha_challenge, shadow_ban, permanent_ban) still supported.
- **Rate limit enforcement:** Redis `enforcement_rate_limit:{userId}`; middleware `requireNotEnforcementRateLimited` returns 429 on sensitive routes when set.
- **Manual review:** Creates `FraudEvent` with `eventType: 'enforcement'`, `action: 'review'` (surfaces in security dashboard).

---

## 14b. Content Authenticity Scoring (CAS)

Every video, livestream, or post has a **Content Authenticity Score (0–100)** that updates as engagement events arrive.

| Score | Band | Interpretation |
|-------|------|-----------------|
| 80–100 | highly_organic | Highly organic engagement |
| 60–79  | normal | Normal engagement |
| 40–59  | suspicious | Suspicious |
| 20–39  | likely_manipulation | Likely manipulation |
| 0–19   | confirmed_manipulation | Confirmed manipulation |

**Score influences:** feed ranking (`feedRankingEligible`), trending eligibility (`trendingEligible`, score ≥ 60), monetization eligibility (`monetizationEligible`, score ≥ 60), moderation alerts (`moderationAlert`, score &lt; 40). **Trend eligibility filter:** when building the trending feed (`GET /content/feed/trending`), content with `contentAuthenticityScore < 60` is excluded via `getTrendingEligibleContentIds`; `excludeFromTrending(score)` returns true when score &lt; 60.

**Feed ranking integration:** `finalScore = rankingScore * (authenticityScore / 100)`. Low authenticity suppresses content (e.g. rankingScore 0.8, authenticity 30 → finalScore 0.24). Implemented via `getContentAuthenticityScoreMap(contentIds)`, `applyAuthenticityToRankingScore(rankingScore, authenticityScore)`; applied in `GET /content/feed/:feedType` and `GET /content/feed` (foryou/shorts) before viral boost — items are re-sorted by `finalScore`.

**Signals used for CAS:**

| Category | Example metrics |
|----------|-----------------|
| Viewer diversity | Unique viewers vs total viewer sessions |
| Watch quality | Completion rate, watch time (ContentEngagement) |
| Engagement diversity | Unique accounts liking/commenting vs total interactions |
| Device diversity | Unique device fingerprints among engagers |
| Geo diversity | (Optional) spread of locations |
| Temporal patterns | Burst spikes vs organic (variance of like/comment timestamps) |
| Account quality | Average trust score of engaging users |

**Data model:** `ContentAuthenticity` schema — `contentId` (String), `contentType` (video | livestream | post), `authenticityScore` (0–100), `metrics` (uniqueViewers, totalViews, avgWatchTime, completionRate, uniqueLikes, uniqueComments, deviceDiversity, geoDiversity, suspiciousVelocity), `lastUpdated`. **Implementation:** `contentAuthenticityService` (gatherSignalsForStream → factors + metrics, computeScoreFromFactors, getContentAuthenticityScore, updateContentAuthenticityScore). CAS is updated on like/comment (fire-and-forget). Admin: **GET /moderation/content-authenticity/stream/:streamId** (query `?refresh=true` to recompute).

---

## 14c. Engagement Velocity Detection

Fake virality often shows **unnatural view spikes** (e.g. 0, 0, 0 then 10k views in 2 minutes) vs organic growth (gradual increase).

**Logic:** `spikeRatio = views.lastMinute / views.avgLastHour` (avgLastHour = views in last hour ÷ 60). If `spikeRatio > 15`, content is flagged for review.

**Implementation:**
- **Service:** `engagementVelocityService.js` — `getViewTimeline(contentId, contentType)` (streams use LiveViewer joinedAt; returns lastMinute, lastHour, avgLastHour), `detectVelocitySpike(contentId, contentType)`, `flagContent(contentId, reason, meta)` (writes FraudEvent with refType `content`, eventType `viewer_spike`, action `review`).
- **Worker:** `workers/engagementVelocityWorker.js` — runs on an interval (default 2 min), selects streams with viewer joins in the last 5 minutes, runs `detectVelocitySpike` for each; when spike is detected calls `flagContent(contentId, "velocity_spike")`.
- **Config:** `ENGAGEMENT_VELOCITY_SPIKE_RATIO` (default 15), `ENGAGEMENT_VELOCITY_INTERVAL_MS` (default 120000), `ENGAGEMENT_VELOCITY_BATCH_SIZE` (default 50).

---

## 14d. Device Cluster Detection

Bot networks often produce **many interactions from few devices** (e.g. 500 likes from 5 devices → ratio 5/500 = 0.01).

**Logic:** `ratio = uniqueDevices / interactions.length`. If `ratio < 0.2` (and interaction count ≥ 10), content is flagged as `device_cluster`. Devices = distinct `DeviceFingerprint.fingerprint` for users who liked or commented; interactions = StreamLike + StreamComment count for the content.

**Implementation:**
- **Service:** `engagementVelocityService.js` — `detectDeviceCluster(contentId, contentType)` (streams: StreamLike + StreamComment + DeviceFingerprint), `checkAndFlagDeviceCluster(contentId, contentType)` (flags via `flagContent(contentId, "device_cluster", meta)`).
- **Worker:** Same `engagementVelocityWorker` runs device-cluster check per stream after the velocity check.
- **Config:** `DEVICE_CLUSTER_RATIO_THRESHOLD` (default 0.2), `DEVICE_CLUSTER_MIN_INTERACTIONS` (default 10).

---

## 14e. Engagement Authenticity Score

Engagement quality is measured as **unique users vs total interactions**:

**Formula:** `authenticity = uniqueUsersInteracting / totalInteractions` (0–1).

| Example | totalInteractions | uniqueUsersInteracting | authenticity |
|---------|-------------------|------------------------|--------------|
| Bad     | 1000 likes        | 10 unique users        | 0.01         |
| Good    | 1000 likes        | 850 unique users       | 0.85         |

**Implementation:** `engagementAuthenticityService.js` — `getStreamEngagementMetrics(streamId)` and `getCreatorEngagementMetrics(creatorId)` return `authenticity`, `uniqueUsersInteracting`, `totalInteractions`, and `engagementQuality` (capped at 1). `getEngagementAuthenticity(contentId, contentType)` returns `{ authenticity, uniqueUsersInteracting, totalInteractions }`. Stream/creator authenticity APIs and CAS use these metrics.

---

## 14f. Trend Manipulation Detection

Trending hashtags/tags can be hijacked by coordinated bot networks. Detection signals:

| Signal | Example |
|--------|---------|
| **Hashtag burst** | 500 posts with same tag in seconds |
| **Creator cluster** | Same accounts repeatedly pushing the tag (few creators, many posts) |
| **Interaction ring** | Accounts liking each other's posts (mutual likes among tag creators) |
| **Geo concentration** | 90% traffic from same proxy region |

**Implementation:**
- **Service:** `trendManipulationService.js` — uses `LiveStream.tags` as tag source. `detectHashtagBurst(tag)` (posts in short window ≥ threshold), `detectCreatorCluster(tag)` (top N creators ≥ 80% of posts), `detectInteractionRing(tag)` (mutual like edges among tag creators via `botGraphDetection.getMutualInteractionEdges`), `detectGeoConcentration(tag)` (engager countries from LoginAudit; one country ≥ 90%). `detectTrendManipulation(tag)` runs all four; `checkAndFlagTrendManipulation(tag)` writes FraudEvent when any signal fires.
- **Data model:** `HashtagTrend` schema — `hashtag` (String, unique), `usageCount`, `uniqueCreators`, `geoSpread` (0–100), `suspiciousClusterScore` (0–100), `lastUpdated`. Updated on each `detectTrendManipulation(tag)` via `upsertHashtagTrend`.
- **FraudEvent:** `eventType: 'trend_manipulation'`, `refType: 'hashtag'`, `refId: tag`, `signals: ['hashtag_burst' | 'creator_cluster' | 'interaction_ring' | 'geo_concentration']`.
- **Admin API:** **GET /moderation/trend-manipulation/alerts** — list recent trend_manipulation flags. **GET /moderation/trend-manipulation/:tag** — run detection for tag; `?flag=true` to flag and persist.
- **Worker:** `workers/trendManipulationWorker.js` — runs on an interval (default 15 min). Collects active hashtags from streams (last 24h), runs `collectHashtagStats(hashtag)`; if `usageCount > 1000` and `uniqueCreators < 50` → `flagHashtag(hashtag, 'low_creator_diversity')`; if `geoSpread < 0.2` → `flagHashtag(hashtag, 'geo_cluster')`. Uses `flagHashtag` (alias of `flagTag`).
- **Service helpers:** `collectHashtagStats(hashtag)` returns `{ usageCount, uniqueCreators, geoSpread }` (geoSpread 0–1); populates HashtagTrend via `detectTrendManipulation` if missing. `flagHashtag(hashtag, reason, meta)` = `flagTag`.
- **Config:** `TREND_BURST_WINDOW_SEC`, `TREND_BURST_THRESHOLD`, `TREND_CREATOR_CONCENTRATION`, `TREND_CREATOR_TOP_N`, `TREND_INTERACTION_RING_MIN_EDGES`, `TREND_GEO_CONCENTRATION`; worker: `TREND_MANIPULATION_INTERVAL_MS`, `TREND_MANIPULATION_BATCH_SIZE`, `TREND_LOW_DIVERSITY_USAGE_MIN` (1000), `TREND_LOW_DIVERSITY_CREATORS_MAX` (50), `TREND_GEO_CLUSTER_SPREAD_MAX` (0.2).

---

## 14g. Creator Manipulation Detection

Creators who repeatedly post manipulated content are penalized.

**Example rule:** 5+ manipulated videos within 7 days → **reduce creator reach**, **remove monetization eligibility**.

**Definition of “manipulated”:** content with Content Authenticity Score below threshold (default &lt; 40).

**Implementation:**
- **Service:** `creatorManipulationService.js` — `getManipulatedContentCount(creatorId, windowDays, scoreThreshold)` counts creator’s streams in the window with `ContentAuthenticity.authenticityScore < 40`; `isCreatorManipulationPenalized(creatorId)` true when count ≥ 5; `getCreatorReachMultiplier(creatorId)` returns 0.2 when penalized, 1 otherwise; `isMonetizationEligible(creatorId)` false when penalized.
- **Reduce creator reach:** `ghostBanService.getFeedRankingMultiplier` and `getLiveDiscoverabilityMultiplier` multiply by `creatorManipulationService.getCreatorReachMultiplier(userId)`, so penalized creators get 0.2× reach.
- **Monetization eligibility:** Enforced via Creator Reputation Score (CRS §14j). When creator is penalized, CRS is capped at 25 → `isPayoutEligible` false → payout routes return 403.
- **Admin API:** **GET /moderation/creator-manipulation/:creatorId** — returns `manipulatedCount`, `penalized`, `reachMultiplier`, `monetizationEligible`, `windowDays`, `countThreshold`, `manipulatedScoreMax`.
- **Config:** `CREATOR_MANIPULATION_WINDOW_DAYS` (7), `CREATOR_MANIPULATION_COUNT_THRESHOLD` (5), `CREATOR_MANIPULATION_SCORE_MAX` (40), `CREATOR_MANIPULATION_REACH_MULTIPLIER` (0.2).

---

## 14h. Trend Hijacking Protection

Prevent spam accounts from hijacking trending hashtags.

| Rule | Action |
|------|--------|
| **New account + viral hashtag** | Lower ranking weight (e.g. 0.3×) |
| **Low trust accounts posting trending tags** | Suppressed (0×, excluded from feed) |

**Implementation:**
- **Service:** `trendHijackingService.js` — viral tags = `HashtagTrend` with `usageCount >= 500` (cached 5 min); trending tags = usageCount >= 100. New account = `User.createdAt` within last 14 days. Low trust = AccountTrustScore/trust &lt; 40. `getTrendHijackingMultiplier(creatorId, contentTags)` and batch `getTrendHijackingMultipliersForItems(items)` return 0 (suppress), 0.3 (new + viral), or 1.
- **Feed integration:** After authenticity-based finalScore, multiply each item’s `finalScore` by the trend-hijacking multiplier; filter out items with finalScore 0 (suppressed); re-sort. Applied in `GET /content/feed/:feedType` and `GET /content/feed` (foryou/shorts).
- **Config:** `TREND_HIJACK_NEW_ACCOUNT_DAYS` (14), `TREND_HIJACK_VIRAL_MIN_USAGE` (500), `TREND_HIJACK_TRENDING_MIN_USAGE` (100), `TREND_HIJACK_LOW_TRUST_THRESHOLD` (40), `TREND_HIJACK_NEW_ACCOUNT_WEIGHT` (0.3).

---

## 14i. Admin Moderation Dashboard

Admin-only dashboard panels for content authenticity and trend monitoring.

**Content Authenticity Panel** — `GET /dashboards/admin/moderation/content-authenticity` (optional `?limit=&days=`):
- **Authenticity score:** Low-CAS content (ContentAuthenticity with `authenticityScore < 40`), with contentId, contentType, metrics, lastUpdated.
- **Suspicious signals:** FraudEvents with `refType: 'content'`, `eventType: 'viewer_spike'` (velocity_spike, device_cluster, etc.), with signals, refId, createdAt, meta.
- **Device clusters:** FraudEvents with signal `device_cluster` (content flagged for few-devices / many-interactions).

**Trend Monitoring Panel** — `GET /dashboards/admin/moderation/trend-monitoring` (optional `?limit=&days=`):
- **Trending hashtags:** HashtagTrend documents sorted by usageCount (hashtag, usageCount, uniqueCreators, geoSpread, suspiciousClusterScore, lastUpdated).
- **Suspicious hashtag spikes:** FraudEvents `eventType: 'trend_manipulation'`, refType hashtag (hashtag_burst, geo_cluster, etc.).
- **Creator clusters:** Trend_manipulation events with signals `creator_cluster` or `low_creator_diversity` (tag, meta, createdAt).

**Combined:** `GET /dashboards/admin/moderation/dashboard` returns `{ contentAuthenticity, trendMonitoring }`. Service: `moderationDashboardService.js`. Web SDK: `adminGetModerationDashboard`, `adminGetContentAuthenticityPanel`, `adminGetTrendMonitoringPanel`.

---

## 14j. Creator Reputation Score (CRS)

Each creator receives a **dynamic reputation score (0–100)** that controls payout eligibility, livestream monetization, storefront and auction privileges, and algorithmic promotion.

**Signals used to calculate creator trust**

| Category | Signals (each 0–100, higher = better) |
|----------|--------------------------------------|
| **Account trust** | Overall platform trust score (AccountTrustScore) |
| **Content authenticity** | CAS average of creator’s videos/streams (ContentAuthenticity.authenticityScore per content, averaged) |
| **Audience authenticity** | % of real viewers (engagement authenticity: uniqueUsersInteracting / totalInteractions, from creator’s content) |
| **Monetization behavior** | Gifts/subscriptions patterns (100 minus penalty for FraudEvent gift blocks where creator is receiver) |
| **Refund rate** | Disputes/refunds (100 minus penalty for Disputes against creator’s orders) |
| **Report rate** | Abuse reports (100 minus penalty for Reports against creator as user or against their streams/content) |
| **Payment history** | Chargebacks or fraud (100 when none; penalty when Chargeback.userId = creatorId) |
| **Community reputation** | Moderation strikes (UserStrike: 0 strikes = 100, 1 = 80, 2 = 60, 3+ or banned = 0) |

CRS = weighted average of the above factors; if creator manipulation is penalized (5+ manipulated content in 7 days), score is capped at 25. Default weights: account trust 0.2, content authenticity 0.15, audience authenticity 0.15, monetization behavior 0.1, refund rate 0.1, report rate 0.1, payment history 0.1, community reputation 0.1. Config: `CRS_WEIGHT_*`, `CRS_SIGNAL_WINDOW_DAYS` (365).

**Bands:**

| Score | Band | Meaning |
|-------|------|---------|
| 90–100 | trusted | Trusted creator |
| 70–89 | good_standing | Good standing |
| 50–69 | monetization_limited | Monetization limited |
| 30–49 | high_risk | High risk |
| 0–29 | monetization_disabled | Monetization disabled |

**Monetization access control (by score):**

| Score | Monetization access |
|-------|---------------------|
| 90+ | Full monetization |
| 70–89 | Normal |
| 50–69 | Reduced reach (algorithmic promotion × 0.7) |
| 30–49 | Monetization limited (no storefront/auctions; payouts and gifts allowed) |
| &lt;30 | Monetization disabled (no payouts, no gifts, no storefront, no auctions) |

**Example enforcement:** `disableCreatorMonetization(creatorId)` returns true when score &lt; 30 (block payouts and livestream gifts). `disableAuctions(creatorId)` returns true when score &lt; 50 (block auction creation). Existing gates use `isPayoutEligible`, `isLivestreamMonetizationEligible`, `isStorefrontEligible`, `isAuctionEligible`; the disable helpers are available for explicit checks.

**What CRS controls:**

- **Payout eligibility** — score ≥ 30 (else 403 on payout request/withdraw)
- **Livestream monetization** — score ≥ 30 (gifts to creator blocked when below)
- **Storefront privileges** — score ≥ 50 (create products)
- **Auction privileges** — score ≥ 50 (create auctions)
- **Algorithmic promotion** — multiplier by band: trusted/good_standing 1, monetization_limited 0.7, high_risk 0.3, monetization_disabled 0 (applied in feed ranking and live discoverability)

**Implementation:**
- **Schema:** `CreatorReputation` (creatorId, score, band, factors, lastUpdated). `factors` includes: accountTrustScore, creatorManipulation, contentAuthenticityAvg, audienceAuthenticity, monetizationBehavior, refundRateScore, reportRateScore, paymentHistoryScore, communityReputation. Stored in `packages/database/src/schemas/CreatorReputation.js`.
- **Service:** `creatorReputationService.js` — `gatherCreatorSignals(creatorId)` returns all signal values (0–100); `computeScoreFromSignals(signals)` returns weighted CRS; when creator manipulation is penalized, CRS is capped at 25. `getCreatorReputation(creatorId)`, `computeCreatorReputation(creatorId, { persist })`, eligibility helpers, `getAlgorithmicPromotionMultiplier(creatorId)`.
- **Payouts:** `POST /payments/payouts/request` and `POST /payments/payouts/withdraw` use `creatorReputationService.isPayoutEligible(user._id)`; if false → 403 `MONETIZATION_SUSPENDED`.
- **Storefront:** `POST /shop/products` checks `isStorefrontEligible(user._id)`; if false → 403 `STOREFRONT_RESTRICTED`.
- **Auctions:** `POST /shop/auctions` checks `isAuctionEligible(user._id)`; if false → 403 `AUCTION_RESTRICTED`.
- **Livestream gifts:** Before crediting creator on gift, `isLivestreamMonetizationEligible(receiverId)`; if false, gift is not processed (creator does not receive).
- **Algorithmic promotion:** `ghostBanService.getFeedRankingMultiplier` and `getLiveDiscoverabilityMultiplier` multiply by `creatorReputationService.getAlgorithmicPromotionMultiplier(userId)`.
- **Admin API:** **GET /moderation/creator-reputation/:creatorId** — returns score, band, factors, payoutEligible, livestreamMonetizationEligible, storefrontEligible, auctionEligible, algorithmicPromotionMultiplier; `?refresh=true` recomputes and persists.
- **Config:** `CRS_SCORE_WHEN_MANIPULATION_PENALIZED` (25), `CRS_PROMO_MULT_*`, `CRS_WEIGHT_ACCOUNT_TRUST` (0.2), `CRS_WEIGHT_CONTENT_AUTHENTICITY` (0.15), `CRS_WEIGHT_AUDIENCE_AUTHENTICITY` (0.15), `CRS_WEIGHT_MONETIZATION_BEHAVIOR` (0.1), `CRS_WEIGHT_REFUND_RATE` (0.1), `CRS_WEIGHT_REPORT_RATE` (0.1), `CRS_WEIGHT_PAYMENT_HISTORY` (0.1), `CRS_WEIGHT_COMMUNITY_REPUTATION` (0.1), `CRS_SIGNAL_WINDOW_DAYS` (365).

---

## 14k. Gift Fraud Detection

Creators can exploit gift systems via self-gifting loops. Detection signals:

| Signal | Description |
|--------|-------------|
| **Same IP/device** | Sender and receiver share the same device fingerprint or same IP (receiver’s last login IP) |
| **Gift rings** | Circular gifting between accounts (receiver has sent many gifts back to sender in 24h) |
| **Rapid gift loops** | Velocity limit (gifts per minute) and cooldown |

**Example rule:** `if (gift.senderDevice === gift.receiverDevice) flagFraud(gift.sender)` — implemented as: if sender’s device fingerprint is linked to the receiver in `DeviceFingerprint`, the gift is blocked and the sender is flagged.

**Implementation:**
- **fraudService.js:** `checkSameDeviceGift(senderId, receiverId, senderFingerprint)` — returns `{ allowed: false, reason: 'same_device' }` when `DeviceFingerprint` has `(fingerprint, userId: receiverId)`. `checkSameIpGift(senderId, receiverId, senderIp)` — compares `senderIp` to receiver’s last successful login IP from `LoginAudit`; if same, returns `{ allowed: false, reason: 'same_ip' }`. `flagGiftFraud(senderId, reason, meta)` — creates `FraudEvent` with `eventType: 'gift'`, `action: 'block'`, `signals: [reason]` (e.g. `same_device`, `same_ip`, `gift_ring`). Existing `checkCircularGifts(senderId, receiverId)` detects gift rings (receiver→sender gift count in 24h); `checkGiftVelocity` covers rapid loops.
- **Live gift flow (WebSocket):** Before processing gift, run `checkSameDeviceGift` (when fingerprint present) and `checkSameIpGift`; if not allowed, call `flagGiftFraud` and drop the gift. When `checkCircularGifts` fails, call `flagGiftFraud(senderId, 'gift_ring', …)` and return.
- **Content/REST gift flow:** Same checks; 403 with `GIFT_FRAUD_SAME_DEVICE` or `GIFT_FRAUD_SAME_IP` when blocked; `flagGiftFraud` on same-device, same-IP, and gift-ring.

---

## 14l. Gift Ring Detection (Graph Pattern)

Pattern: **Account A → gifts B, B → gifts C, C → gifts A** (repeated). Detection: if `clusterGiftTransactions > threshold` then `flagGiftRing(cluster)`.

**Implementation:**
- **fraudService.js:** `getGiftGraphEdges(windowDays)` — from `LedgerEntry` (refType gift, type debit) builds directed edge counts (sender → receiver). `findGiftRingClusters(edgeCount, transactionThreshold)` — finds 3-cycles (A→B→C→A); for each cycle sums transactions on the three edges; if total ≥ threshold, returns cluster `{ memberIds: [A,B,C], transactionCount }`. `detectGiftRings(windowDays, threshold)` — returns `{ clusters, windowDays, transactionThreshold }`. `flagGiftRing(cluster)` — creates `FraudEvent` (eventType gift, action block, signals `['gift_ring']`, meta clusterMemberIds + transactionCount) for each member. `runGiftRingDetectionAndFlag()` — runs detection and flags all clusters above threshold. `hasGiftRingFlag(userId)` — true if user has a recent gift_ring FraudEvent (used to block future gifts).
- **Worker:** `workers/giftRingDetectionWorker.js` — runs `runGiftRingDetectionAndFlag` on an interval (default 1 hour). Started with API.
- **Gift flows:** Live and content gift handlers call `hasGiftRingFlag(senderId)`; if true, gift is blocked (live: drop; REST: 403 `GIFT_RING_FLAGGED`).
- **Admin API:** **GET /moderation/gift-rings/alerts** — list recent FraudEvents with signal `gift_ring`. **GET /moderation/gift-rings/clusters** — run detection only, return clusters (query: windowDays, threshold). **POST /moderation/gift-rings/run** — run detection and flag clusters.
- **Config:** `GIFT_RING_WINDOW_DAYS` (7), `GIFT_RING_TRANSACTION_THRESHOLD` (10), `GIFT_RING_DETECTION_INTERVAL_MS` (1 hour).

---

## 14m. Subscription Fraud Detection

Possible abuses: **self subscriptions** (creator subscribing to themselves with alt accounts), **subscription farms** (bot accounts subscribing), **refund loops** (repeated subscribe → refund).

**Example rule:** `if (subscriptionDevice === creatorDevice) flagSubscriptionFraud()` — implemented as: if subscriber’s device fingerprint is linked to the creator in `DeviceFingerprint`, the subscription is blocked and the user is flagged.

**Implementation:**
- **fraudService.js:** `checkSameDeviceSubscription(subscriberId, creatorId, subscriberFingerprint)` — returns `{ allowed: false, reason: 'same_device' }` when `DeviceFingerprint` has (fingerprint, userId: creatorId). `checkSubscriptionFarm(fingerprint)` — counts active subscriptions from all accounts sharing that device in the window; if count &gt; threshold (default 10), returns `{ allowed: false, count }`. `checkSubscriptionRefundLoop(subscriberId, creatorId)` — counts subscriptions and subscription refunds (LedgerEntry type refund/subscription_refund) for that pair in the window; if both above min, returns `{ allowed: false }`. `flagSubscriptionFraud(userId, reason, meta)` — creates `FraudEvent` with `eventType: 'subscription_fraud'`, `action: 'block'`, `signals: [reason]` (same_device, subscription_farm, refund_loop). `hasSubscriptionFraudFlag(userId)` — true if user has a recent subscription_fraud block (used to block future attempts).
- **FraudEvent schema:** `eventType` enum extended with `'subscription_fraud'`.
- **Route:** `POST /payments/subscriptions/creator` accepts optional `deviceFingerprint`; runs `hasSubscriptionFraudFlag`, then `checkSameDeviceSubscription`, `checkSubscriptionFarm`, `checkSubscriptionRefundLoop`; on any failure calls `flagSubscriptionFraud` and returns 403 `SUBSCRIPTION_FRAUD`.
- **Config:** `SUBSCRIPTION_FARM_WINDOW_DAYS` (7), `SUBSCRIPTION_FARM_MAX_SUBS_PER_DEVICE` (10), `SUBSCRIPTION_REFUND_LOOP_WINDOW_DAYS` (30), `SUBSCRIPTION_REFUND_LOOP_MIN_SUBS` (2), `SUBSCRIPTION_REFUND_LOOP_MIN_REFUNDS` (2).

---

## 14n. Creator Revenue Velocity Detection

Unnatural revenue spikes may indicate fraud (e.g. $0, $0, $0, then $10,000 in 10 minutes).

**Detection:** `if (revenueSpikeRatio > 20) flagCreator(creatorId, "revenue_spike")`. Ratio = revenue in short window (e.g. last 10 min) / average revenue per same window over a baseline period (e.g. previous 6 hours). A minimum spike amount (e.g. $50) is required so tiny spikes are not flagged.

**Implementation:**
- **creatorRevenueVelocityService.js:** `getCreatorRevenueInWindow(creatorId, start, end)` — sums `LedgerEntry` type `credit`, `actorId` = creator, in range. `getRevenueSpikeRatio(creatorId)` — short window (default 10 min), baseline (default 6 h); returns `{ ratio, revenueShortCents, avgBaselineCents }`. `detectRevenueSpike(creatorId)` — returns `{ spike, ratio, revenueShortCents, avgBaselineCents }` when ratio > threshold (20) and revenue in window ≥ min. `flagCreator(creatorId, "revenue_spike", meta)` — creates `FraudEvent` with `eventType: 'creator_revenue_spike'`, `refType: 'creator'`, `refId: creatorId`, `signals: ['revenue_spike']`. `checkAndFlagRevenueSpike(creatorId)` — runs detection and flags if spike.
- **FraudEvent schema:** `eventType` enum extended with `'creator_revenue_spike'`.
- **creatorRevenueVelocityWorker.js:** Periodically (default 15 min) fetches creators with revenue in the last hour (`LedgerEntry` distinct `actorId` for `type: 'credit'`), runs `checkAndFlagRevenueSpike` for each (batch size configurable).
- **Admin:** `GET /moderation/revenue-spike/alerts` — list recent creator_revenue_spike events; `GET /moderation/revenue-spike/check/:creatorId` — run detection only (no flag); `POST /moderation/revenue-spike/run` — trigger worker run once.
- **Config:** `CREATOR_REVENUE_SPIKE_RATIO_THRESHOLD` (20), `CREATOR_REVENUE_SHORT_WINDOW_MS` (10 min), `CREATOR_REVENUE_BASELINE_WINDOW_MS` (6 h), `CREATOR_REVENUE_MIN_SPIKE_CENTS` (5000 = $50), `CREATOR_REVENUE_VELOCITY_INTERVAL_MS` (15 min), `CREATOR_REVENUE_VELOCITY_BATCH_SIZE` (50).

---

## 14o. Auction Abuse Detection

For storefront/live auctions: **fake bidders boosting price**, **seller using alternate accounts**.

| Signal | Example |
|--------|---------|
| Device match | bidder device = seller device |
| Bid cluster | same accounts always bidding |
| Last-second fake bids | repeated patterns in final seconds |

**Example rule:** `if (bidderDevice === sellerDevice) blockBid()` — implemented by checking whether the bidder’s device fingerprint is linked to the seller in `DeviceFingerprint`; if so, the bid is blocked and the user is flagged.

**Implementation:**
- **fraudService.js:** `checkSameDeviceAuctionBid(bidderId, sellerId, bidderFingerprint)` — returns `{ allowed: false, reason: 'same_device' }` when the bidder’s fingerprint is linked to the seller (same as gift/subscription same-device check). `checkAuctionBidCluster(auctionId, bidderId)` — blocks when this bidder already has ≥ `AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER` bids on this auction (default 8). `checkLastSecondBidPattern(auctionId, bidderId, endsAt)` — when auction ends within the configured window (default 30s), blocks if this bidder has already placed ≥ `AUCTION_LAST_SECOND_MAX_BIDS` (default 2) bids in that window. `flagAuctionBidFraud(bidderId, auctionId, reason, meta)` — creates `FraudEvent` with `eventType: 'auction_fraud'`, `refType: 'auction'`, `refId: auctionId`, `action: 'block'`. `hasAuctionBidFraudFlag(userId)` — true if user has a recent auction_fraud block (used to block further bids).
- **FraudEvent schema:** `eventType` enum extended with `'auction_fraud'`.
- **Route:** Auction WebSocket bid handler in **live.js** (`ws/auction/:id`): before accepting a bid, runs `hasAuctionBidFraudFlag`, then (if `msg.data.deviceFingerprint` present) `checkSameDeviceAuctionBid`, then `checkAuctionBidCluster`, then `checkLastSecondBidPattern`. On any failure calls `flagAuctionBidFraud` and sends `bid_error` with `AUCTION_BID_FRAUD`.
- **Config:** `AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER` (8), `AUCTION_LAST_SECOND_WINDOW_SEC` (30), `AUCTION_LAST_SECOND_MAX_BIDS` (2).

---

## 14p. Payout Risk Engine

Before paying creators, run fraud checks. If creator fraud score exceeds threshold (default 80), hold payout.

**Example:** `async function checkPayoutRisk(creatorId) { const fraudScore = await getCreatorFraudScore(creatorId); if (fraudScore > 80) holdPayout(creatorId); }`

**Implementation:**
- **fraudService.js:** `getCreatorFraudScore(creatorId)` — returns 0–100 from FraudEvents (userId or refType=creator, refId=creatorId) and chargeback count in the last 90 days; uses max of user risk, creator-ref risk, and chargeback penalty. `checkPayoutRisk(creatorId, amountCents)` — calls `getCreatorFraudScore`; if score > `PAYOUT_RISK_THRESHOLD` (80), calls `applyPayoutHold(creatorId, amountCents, { reason: 'payout_risk_engine' })` and returns `{ allowed: false, fraudScore, holdApplied: true }`; otherwise returns `{ allowed: true, fraudScore, tier, holdUntil }` for the Payout Hold System (§14q).
- **Routes:** `POST /payments/payouts/request` and `POST /payments/payouts/withdraw` run `checkPayoutRisk(creatorId, amountCents)` after CRS eligibility; if `!allowed`, respond 403 `PAYOUT_HELD` and do not call `requestCreatorPayout`. Existing `getHeldAmount` / `PayoutHold` in paymentOrchestration already reduce withdrawable balance.
- **Config:** `PAYOUT_RISK_THRESHOLD` (80), `CREATOR_FRAUD_SCORE_WINDOW_DAYS` (90), `CREATOR_FRAUD_CHARGEBACK_PENALTY` (40).

---

## 14q. Payout Hold System

Suspicious payouts are delayed by risk tier. Delays are applied when the payout request is created (tier and holdUntil stored on PayoutRequest); automated batch and auto cycle only process when tier allows and holdUntil has passed.

**Example:**

- risk score &lt; 40 → immediate payout  
- risk score 40–70 → 24 hour delay  
- risk score &gt; 70 → manual review  

**Implementation:**
- **fraudService.js:** `getPayoutHoldTier(fraudScore)` — returns `{ tier: 'immediate'|'delay_24h'|'manual_review', holdUntil?: Date }`. &lt; 40 → immediate (no holdUntil); 40–70 → delay_24h with holdUntil = now + 24h; &gt; 70 → manual_review (no auto-processing). `checkPayoutRisk` now also returns `tier` and `holdUntil` for the hold system.
- **PayoutRequest schema:** `payoutRiskTier` (enum: immediate, delay_24h, manual_review), `holdUntil` (Date, optional). Index on status + holdUntil.
- **paymentOrchestration.requestCreatorPayout:** Accepts `payoutRiskTier` and `holdUntil`; stores them on the created PayoutRequest.
- **paymentOrchestration.runAutomatedPayoutCycle** and **processPayouts:** Only include payouts where `payoutRiskTier` ≠ manual_review and (`holdUntil` is null or `holdUntil` ≤ now). Manual-review payouts are processed only via admin approve (executePayoutWithChecks / batch-approve).
- **Routes:** `POST /payments/payouts/request` and `POST /payments/payouts/withdraw` pass `payoutRisk.tier` and `payoutRisk.holdUntil` from `checkPayoutRisk` into `requestCreatorPayout`.
- **Config:** `PAYOUT_HOLD_TIER_IMMEDIATE_MAX` (40), `PAYOUT_HOLD_TIER_DELAY_MAX` (70), `PAYOUT_HOLD_DELAY_HOURS` (24).

---

## 14r. Creator Trust Timeline

Track Creator Reputation Score (CRS) changes over time for admin dashboard charts.

**Model:** `CreatorTrustHistory` — creatorId, score, reason, timestamp (one document per snapshot).

**Admin dashboard:** Timeline/chart data (e.g. Creator Reputation 100 | * … 90 | * … 80 | * … 70 | *).

**Implementation:**
- **CreatorTrustHistory schema:** creatorId (ref User), score (0–100), reason (string, default 'computed'), timestamp (Date). Index creatorId + timestamp.
- **creatorTrustHistoryService.js:** `snapshot(creatorId, score, reason)` — appends one history record. `getHistory(creatorId, { limit, order })` — returns `[{ date, score, reason }, ...]` for chart (order 1 = ascending for time axis).
- **creatorReputationService.computeCreatorReputation:** When `opts.persist` is true, after upserting CreatorReputation calls `creatorTrustHistoryService.snapshot(cid, score, opts.reason || 'computed')`.
- **Admin API:** `GET /moderation/creator-trust/:creatorId/history` — returns `{ creatorId, history }`. Query params: `limit` (default 90, max 500), `order=asc` for chart (oldest first).

---

## 14s. Monetization Risk Alerts

Alert the fraud team when monetization risk triggers fire: **suspicious gift loops**, **revenue spikes**, **chargeback spikes**, **abnormal subscriptions**.

**Example:** `if (chargebackRate > 5%) alertFraudTeam('chargeback_spike', { rate, ... })`

**Implementation:**
- **MonetizationRiskAlert schema:** trigger (enum: suspicious_gift_loops, revenue_spike, chargeback_spike, abnormal_subscriptions), meta, severity (low/medium/high/critical). Index trigger + createdAt.
- **monetizationRiskAlertService.js:** `alertFraudTeam(trigger, meta, opts)` — creates MonetizationRiskAlert, optionally sends email to FRAUD_TEAM_EMAIL or INITIAL_ADMIN_EMAIL, writes AdminAuditLog. Optional debounce (one alert per trigger per debounce window). `getRecentAlerts(limit, trigger)` — for admin dashboard. `checkChargebackRateAlert()` — computes platform chargeback rate (Chargeback count / PaymentTransaction count in window); if rate &gt; threshold (default 5%), calls alertFraudTeam('chargeback_spike', { chargebackRate, ... }); debounced once per hour.
- **Wiring:** fraudService.runGiftRingDetectionAndFlag — after flagging clusters, alertFraudTeam('suspicious_gift_loops', { clusterCount, ... }). creatorRevenueVelocityService.checkAndFlagRevenueSpike — when spike, alertFraudTeam('revenue_spike', { creatorId, ratio, ... }). fraudService.flagSubscriptionFraud — alertFraudTeam('abnormal_subscriptions', { userId, reason, ... }). monetizationRiskAlertWorker — runs checkChargebackRateAlert hourly.
- **Admin API:** `GET /moderation/monetization-risk/alerts` — list recent alerts (?limit=50, ?trigger=chargeback_spike). `POST /moderation/monetization-risk/check-chargeback` — run chargeback rate check once.
- **Config:** `MONETIZATION_ALERT_CHARGEBACK_RATE_THRESHOLD` (0.05), `MONETIZATION_ALERT_CHARGEBACK_WINDOW_DAYS` (30), `MONETIZATION_ALERT_DEBOUNCE_MS` (1h), `MONETIZATION_ALERT_CHECK_INTERVAL_MS` (1h), `FRAUD_TEAM_EMAIL` (optional, else INITIAL_ADMIN_EMAIL).

---

## 14t. Monetization Risk Queue

Suspicious creators go to a manual review queue. Admin actions: **approve payout**, **disable monetization**, **temporary suspension**, **permanent ban**.

**Model (CreatorReviewQueue):** creatorId, riskScore, reason, status (pending | in_review | resolved), assignedModerator, resolution, resolvedBy, resolvedAt, resolutionNote, meta.

**Implementation:**
- **CreatorReviewQueue schema:** creatorId (ref User), riskScore (0–100), reason, status, assignedModerator (ref User), resolution (approve_payout | disable_monetization | temporary_suspension | permanent_ban), resolvedBy, resolvedAt, resolutionNote, meta. Indexes: creatorId+status, status+createdAt, assignedModerator+status.
- **creatorReviewQueueService.js:** `addToQueue(creatorId, riskScore, reason, meta)` — add or update pending item. `getQueue(status, limit)` — list items (optional filter by status). `getById(id)` — one item with populated creator/moderator. `assignModerator(queueId, moderatorId)` — set assignedModerator and status in_review. `resolve(queueId, action, adminId, note)` — apply action and mark resolved: **approve_payout** = delete PayoutHolds for creator; **disable_monetization** = set User.flags.monetizationDisabled = true; **temporary_suspension** = User.status = 'suspended', suspensionReason; **permanent_ban** = User.status = 'banned', suspensionReason. Writes AdminAuditLog on resolve.
- **creatorReputationService:** `isMonetizationDisabledByAdmin(creatorId)` — true when User.flags.monetizationDisabled. All eligibility checks (isPayoutEligible, isLivestreamMonetizationEligible, isStorefrontEligible, isAuctionEligible) return false when this flag is set.
- **Admin API:** `GET /moderation/creator-review-queue` (?status=pending|in_review|resolved, ?limit=100). `GET /moderation/creator-review-queue/:id`. `POST /moderation/creator-review-queue/add` body { creatorId, riskScore, reason, meta }. `POST /moderation/creator-review-queue/:id/assign` body { moderatorId }. `POST /moderation/creator-review-queue/:id/resolve` body { action, note } (action: approve_payout | disable_monetization | temporary_suspension | permanent_ban).

---

## 14u. Integration with Feed Algorithm

Creators with low reputation receive reduced reach. Low reputation creators become less discoverable.

**Example:** `finalScore = contentScore * (creatorReputation / 100)`

**Implementation:**
- **creatorReputationService.getCreatorReputationScoreMap(creatorIds)** — batch returns Map&lt;creatorIdStr, score 0–100&gt; from CreatorReputation (and 0 for User.flags.monetizationDisabled). Default score for creators with no record: `CRS_DEFAULT_FEED_SCORE` (50).
- **Feed routes** (`GET /content/feed/:feedType`, `GET /content/feed` for foryou/shorts): after authenticity and trend-hijacking multipliers, apply **finalScore = finalScore × (creatorReputation / 100)** using `getCreatorReputationScoreMap` for all creator IDs in the batch; then re-filter and re-sort by finalScore. So effective formula: finalScore = contentScore × (authenticity/100) × trendHijack × (creatorReputation/100).
- **ghostBanService.getFeedRankingMultiplier** already includes CRS (via getAlgorithmicPromotionMultiplier) for pre-filter/sort; the explicit creatorReputation/100 step in the feed ensures final ranking reflects CRS directly.
- **Config:** `CRS_DEFAULT_FEED_SCORE` (50) for creators with no CreatorReputation record.

---

## 15. Machine Learning Upgrade (Future)

After collecting enough data, train models to further harden discovery and abuse detection.

### Recommended models

| Model | Purpose |
|-------|---------|
| **Isolation Forest** | Anomaly detection |
| **Random Forest** | Bot classification / engagement fraud |
| **Graph Neural Network** | Bot clusters / fraud networks |
| **LSTM** | Behavior sequences / engagement timing patterns |
| **Gradient Boosting** | Engagement fraud |

### Architecture

```
Kafka events
     ↓
Python ML workers
     ↓
prediction score
     ↓
risk engine
```

- **Input:** Same Kafka topics (user_activity, auth_events, payments, live_events, moderation) or a dedicated `ml_events` topic.
- **Python ML workers:** Consume events, build feature vectors/sequences/graphs, run Isolation Forest (anomaly), Random Forest (fraud), GNN (bot clusters), LSTM (timing). Output per user or per content: risk/anomaly score.
- **Output:** POST to Node API (e.g. `/internal/ml-risk`) or publish to Kafka topic `ml_risk_scores`; Node enforcement engine merges ML score into `totalRisk` and applies rules (captcha, rate limit, shadow ban, manual review, permanent ban).
- **Detail:** See **docs/phase-6-graph-ml-architecture.md** (Python worker contract, feature pipeline, deployment).

### Final result

With rule-based systems **plus** ML models, Millo’s discovery system becomes **extremely resistant to manipulation**.

**Protection covers:**

- Fake views  
- Like farms  
- Comment bots  
- Bot clusters  
- Trend hijacking  
- Fake virality  
- Coordinated engagement  

**The feed algorithm only promotes authentic content.**

---

## 17. AI Fraud Detection (Future)

Machine learning models can augment rule-based fraud detection for creator and monetization trust.

| Model | Purpose |
|-------|---------|
| **Isolation Forest** | Revenue anomalies |
| **Random Forest** | Fraud classification |
| **Graph Neural Networks** | Gift rings |
| **LSTM** | Monetization patterns |

Integration path: events (Kafka/payments/live) → Python ML workers → risk/fraud score → Node risk engine and enforcement (see §15 and **docs/phase-6-graph-ml-architecture.md**).

### Final Result

The **Creator Reputation & Monetization Trust System** protects all monetization features on Millo.

**Protection includes:**

- Gift fraud  
- Subscription abuse  
- Auction manipulation  
- Refund abuse  
- Fake engagement monetization  
- Creator payout fraud  

**Creators with high trust receive:**

- Better feed ranking  
- Faster payouts  
- More monetization options  

**Suspicious creators are automatically restricted** (payout holds, delayed payouts, manual review, reduced reach, or disabled monetization via CRS and admin actions).

---

## Implementation Map

| Item | Location |
|------|----------|
| **Adaptive Risk Engine (concept)** | Rules + ML + feedback loop; learns from moderation decisions, new fraud patterns, user reports, enforcement results; see § Concept: Adaptive Risk Engine |
| **ModerationTrainingData** | packages/database/src/schemas/ModerationTrainingData.js — userId, contentId, features, label, moderatorDecision; labeled examples for ML |
| **MlFeatureSnapshot** | packages/database/src/schemas/MlFeatureSnapshot.js — userId, contentId, eventType, features; unlabeled feature vectors from events |
| **Feature Generator** | featureGeneratorService (getViewVelocity, getDeviceClusterSize, getTrustScore, getEngagementRatio); featureGeneratorWorker.generateFeatures(event) → generateAndStoreFeatures stores in MlFeatureSnapshot for ML training |
| **ML inference API** | POST /ml/predict-risk — body { viewVelocity, deviceCluster, trustScore, engagementRatio } → { riskProbability }; mlInferenceService.predict used by route and worker |
| **ML Prediction Worker** | mlPredictionWorker.predictRisk(features) → mlInferenceService.predict; if riskProbability > ML_PREDICTION_FRAUD_THRESHOLD (0.8) calls flagFraud(userId) (FraudEvent + enforce job); env ML_PREDICTION_FRAUD_THRESHOLD |
| **Adaptive Rule Generator (concept)** | When models detect new patterns (e.g. giftVelocity + deviceCluster + low trust), system can auto-generate rules (e.g. giftVelocity > t1 AND deviceCluster > t2 → fraud); rules feed into Risk Engine; implement via interpretable models, rule-mining, or human-in-the-loop approval; see § Concept: Adaptive Risk Engine |
| **Shadow mode model testing** | New models run silently; predictions logged; compared with moderator decisions; if accuracy/precision/recall meet gate, model becomes active; aligns with existing AI anomaly shadow mode (§10) |
| **Continuous learning loop** | Platform Events → Feature Extraction → ML Predictions → Moderation Decisions → Training Dataset → Model Retraining → Improved Detection; closed cycle so the system never stops improving; see § Concept: Adaptive Risk Engine |
| **AI-assisted moderator tools** | Moderators see risk score, model explanation (signals), suspicious patterns; example UI: User Risk Profile (Risk Score: 87, Reason: device cluster, abnormal engagement velocity, suspicious gift loop); data from riskEngine.calculateRisk, getClusterSignals, creator-fraud-graph, security dashboard |
| **Explainable AI** | Moderators must see why AI flagged a case: fraud probability + top factors (e.g. deviceClusterSize, engagementVelocity, lowTrustScore); riskEngine returns signals; ML pipeline should return topFactors/explanation (interpretable models or feature importance); store with shadow-mode predictions for evaluation |
| **Model monitoring** | Track precision (fraud detection accuracy), recall (detection coverage), false positive rate (user safety), latency (inference speed); join logged predictions with moderation outcomes; dashboards/alerts; degrade or pause if precision drops or latency exceeds threshold |
| **Fail-safe system** | If ML fails (down, timeout, error): fallback → rule engine; POST /ml/predict-risk and mlInferenceService use heuristic when ML_RISK_SERVICE_URL unreachable; riskEngine is rule-based and independent; ensures platform safety |
| **Final Adaptive Moderation Architecture** | User Activity → Kafka → Feature Extraction → ML Risk Prediction → Risk Engine → Enforcement Engine → Moderator Review → Training Dataset → Model Retraining; detects bot farms, fake engagement, trend manipulation, gift rings, creator fraud, ATO networks, coordinated abuse; AI learns and adapts as tactics change (§ Concept: Adaptive Risk Engine) |
| **Global Trust Graph (concept)** | Graph of platform activity (user–device, user–content, gift flows); device clusters → botGraphDetection.getClusterByDevice; gift rings → fraudService + giftRingDetectionWorker; graph-native → phase-6 Neo4j (docs/phase-6-graph-ml-architecture.md) |
| **Graph Ingestion Pipeline** | User Activity → Kafka → Graph Ingestion Worker → Neo4j; worker maps events (e.g. gift_sent) to Trust Graph edges (GIFTED, USES_DEVICE); Phase 6 (see phase-6-graph-ml-architecture.md § Graph Ingestion Pipeline) |
| **Trust Graph Worker** | packages/api/src/workers/trustGraphWorker.js — processEvent(login → USES_DEVICE, gift/gift_sent → GIFTED); registerKafkaHandlers() wires auth_events + payments to Neo4j via neo4jClusterService.runCypher |
| **Trust Graph Risk Scoring** | riskEngine.calculateRisk adds per-signal: device cluster +40, gift ring +50, engagement cluster +30, payment cluster +50 via neo4jClusterService.getClusterSignals; env RISK_TRUST_GRAPH_* |
| **Graph-based creator fraud** | neo4jClusterService.getCreatorFraudGraphSignals (self-funding gifts: creator receives from 2+ same-device accounts); fraudService.getCreatorFraudScore applies CREATOR_GRAPH_SELF_FUNDING_PENALTY; subscription farms / fake bids placeholders |
| Device + behavior routes | packages/api/src/routes/security.js |
| Fraud device + risk | packages/api/src/services/fraudService.js |
| Risk scoring | packages/api/src/services/riskEngine.js |
| Graph detection | packages/api/src/services/botGraphDetection.js |
| CAPTCHA | packages/api/src/services/captchaService.js |
| Require CAPTCHA Redis | packages/api/src/lib/requireCaptchaRedis.js |
| Bot queue + worker | packages/api/src/lib/botDetectionQueue.js, workers/botDetectionWorker.js |
| Security dashboard | packages/api/src/services/securityDashboardService.js, routes/dashboards.js |
| Rate limit config | packages/security/src/rateLimit.js |
| Redis rate limit store | packages/api/src/lib/rateLimitRedisStore.js (when RATE_LIMIT_USE_REDIS or REDIS_HOST set) |
| AI anomaly (shadow) | packages/api/src/services/aiAnomalyService.js |
| **ATO: LoginAudit** | packages/database/src/schemas/LoginAudit.js |
| **ATO: Geo** | packages/api/src/services/geoService.js |
| **ATO: Impossible travel + risk lock** | packages/api/src/services/accountTakeoverService.js |
| **ATO: Risk lock middleware** | packages/api/src/middleware/riskLock.js |
| **ATO: Step-up verification** | packages/api/src/routes/auth.js (/auth/verification/send-email, /auth/verification/complete) |
| **ATO: Admin clear risk lock** | packages/api/src/routes/moderation.js (POST /moderation/risk-lock/clear) |
| **Unified enforcement engine** | packages/api/src/services/enforcementEngine.js |
| **Enforcement rate limit Redis** | packages/api/src/lib/enforcementRateLimitRedis.js |
| **Enforce job (worker)** | packages/api/src/workers/botDetectionWorker.js (job type `enforce`) |
| **Kafka abuse consumer** | packages/api/src/workers/kafkaAbuseConsumer.js |
| **Kafka abuse handlers** | packages/api/src/services/kafkaAbuseHandlers.js |
| **Kafka consumer API** | packages/api/src/services/kafkaEventBus.js (addAbuseHandler, startAbuseConsumer) |
| **Trust timeline** | packages/database/src/schemas/TrustHistory.js, trustHistoryService.js, GET /admin/trust/:userId/history |
| **Phase 6: Neo4j cluster** | packages/api/src/services/neo4jClusterService.js, GET /moderation/neo4j/gift-rings |
| **Phase 6: Graph + ML architecture** | docs/phase-6-graph-ml-architecture.md |
| **15. ML Upgrade (future)** | Isolation Forest, Random Forest, GNN, LSTM; Kafka → Python ML workers → prediction score → risk engine; see §15 and phase-6-graph-ml-architecture.md |
| **17. AI Fraud Detection (future)** | ML for revenue anomalies (Isolation Forest), fraud classification (Random Forest), gift rings (GNN), monetization patterns (LSTM); see §17 and phase-6-graph-ml-architecture.md |
| **Content Authenticity Score (CAS)** | packages/database/src/schemas/ContentAuthenticity.js, contentAuthenticityService.js, GET /moderation/content-authenticity/stream/:streamId |
| **Trend eligibility filter** | contentAuthenticityService.getTrendingEligibleContentIds, excludeFromTrending; applied in GET /content/feed/trending (exclude CAS &lt; 60) |
| **Feed ranking integration** | finalScore = rankingScore × (authenticityScore/100); getContentAuthenticityScoreMap, applyAuthenticityToRankingScore; applied in content feed routes |
| **Feed algorithm × creator reputation** | finalScore = contentScore × (creatorReputation/100); getCreatorReputationScoreMap; applied in GET /content/feed and GET /content/feed/:feedType after authenticity and trend hijacking; low CRS → reduced reach |
| **Creator manipulation detection** | creatorManipulationService (5+ manipulated content in 7 days → reduce reach; feeds into CRS); ghostBanService reach multiplier |
| **Creator Reputation Score (CRS)** | CreatorReputation schema, creatorReputationService; payouts, storefront, auctions, live gifts, algorithmic promotion; GET /moderation/creator-reputation/:creatorId |
| **Gift fraud detection** | fraudService: checkSameDeviceGift, checkSameIpGift, flagGiftFraud; checkCircularGifts (gift rings); live + content gift routes block and flag on same_device, same_ip, gift_ring |
| **Gift ring detection (graph)** | fraudService: getGiftGraphEdges, findGiftRingClusters, detectGiftRings, flagGiftRing, runGiftRingDetectionAndFlag, hasGiftRingFlag; giftRingDetectionWorker; GET/POST /moderation/gift-rings/* |
| **Subscription fraud detection** | fraudService: checkSameDeviceSubscription, checkSubscriptionFarm, checkSubscriptionRefundLoop, flagSubscriptionFraud, hasSubscriptionFraudFlag; POST /payments/subscriptions/creator (deviceFingerprint); FraudEvent eventType subscription_fraud |
| **Creator revenue velocity (revenue spike)** | creatorRevenueVelocityService.js (getCreatorRevenueInWindow, getRevenueSpikeRatio, detectRevenueSpike, flagCreator, checkAndFlagRevenueSpike); creatorRevenueVelocityWorker.js; FraudEvent eventType creator_revenue_spike; GET/POST /moderation/revenue-spike/* |
| **Auction abuse detection** | fraudService: checkSameDeviceAuctionBid, checkAuctionBidCluster, checkLastSecondBidPattern, flagAuctionBidFraud, hasAuctionBidFraudFlag; auction WebSocket bid handler (live.js) accepts deviceFingerprint, blocks and flags on same_device / bid_cluster / last_second_pattern; FraudEvent eventType auction_fraud |
| **Payout risk engine** | fraudService: getCreatorFraudScore, checkPayoutRisk, PAYOUT_RISK_THRESHOLD; POST /payments/payouts/request and /payments/payouts/withdraw run checkPayoutRisk before requestCreatorPayout; if fraudScore > 80 applyPayoutHold and return 403 PAYOUT_HELD |
| **Payout hold system** | fraudService: getPayoutHoldTier (risk &lt; 40 immediate, 40–70 delay_24h, &gt; 70 manual_review); PayoutRequest.payoutRiskTier, holdUntil; requestCreatorPayout stores tier/holdUntil; runAutomatedPayoutCycle and processPayouts filter by tier and holdUntil |
| **Creator Trust Timeline** | CreatorTrustHistory schema (creatorId, score, reason, timestamp); creatorTrustHistoryService.snapshot, getHistory; CRS persist writes snapshot; GET /moderation/creator-trust/:creatorId/history for admin chart |
| **Monetization risk alerts** | MonetizationRiskAlert schema; monetizationRiskAlertService.alertFraudTeam, getRecentAlerts, checkChargebackRateAlert; wired from gift ring, revenue spike, subscription fraud, chargeback worker; GET/POST /moderation/monetization-risk/* |
| **Monetization risk queue** | CreatorReviewQueue schema (creatorId, riskScore, reason, status, assignedModerator, resolution); creatorReviewQueueService addToQueue, getQueue, assignModerator, resolve; admin actions: approve_payout, disable_monetization, temporary_suspension, permanent_ban; User.flags.monetizationDisabled enforced in CRS; GET/POST /moderation/creator-review-queue/* |
| **Trend hijacking protection** | trendHijackingService (new account + viral tag → 0.3×; low trust + trending tag → suppressed); applied in content feed routes |
| **Admin Moderation Dashboard** | GET /dashboards/admin/moderation/dashboard, content-authenticity, trend-monitoring; moderationDashboardService.js |
| **Engagement velocity detection** | packages/api/src/services/engagementVelocityService.js, workers/engagementVelocityWorker.js (getViewTimeline, detectVelocitySpike, flagContent) |
| **Device cluster detection** | engagementVelocityService.js (detectDeviceCluster, checkAndFlagDeviceCluster), engagementVelocityWorker.js |
| **Engagement authenticity score** | packages/api/src/services/engagementAuthenticityService.js (authenticity = uniqueUsersInteracting / totalInteractions, getEngagementAuthenticity) |
| **Trend manipulation detection** | packages/api/src/services/trendManipulationService.js, GET /moderation/trend-manipulation/:tag, GET /moderation/trend-manipulation/alerts |
| **Trend manipulation worker** | packages/api/src/workers/trendManipulationWorker.js (collectHashtagStats, low_creator_diversity, geo_cluster) |
| **HashtagTrend model** | packages/database/src/schemas/HashtagTrend.js (hashtag, usageCount, uniqueCreators, geoSpread, suspiciousClusterScore, lastUpdated) |

---

## 15. Kafka Abuse Detection Pipeline (Phase 3)

- **Topics:** `user_activity`, `auth_events`, `payments`, `live_events`, `moderation_events` (consumption; `moderation` topic used for moderation_events).
- **Consumer:** Registers handlers via `kafka.addAbuseHandler(topic, handler)`. `kafka.startAbuseConsumer(groupId, opts)` runs a long-lived consumer (group id: `KAFKA_ABUSE_CONSUMER_GROUP_ID` or `millo-abuse-consumer`).
- **Handlers:**  
  - **user_activity** → `runBehaviorAnalysis(event)` — enqueues `risk_score_update` for `event.userId`.  
  - **auth_events** → `detectATO(event)` — `recordLoginAndCheckATO(userId, { ip, geo, ... })` for impossible-travel.  
  - **payments** → `detectGiftFraud(event)` — on `gift.sent` runs `evaluateGiftRisk`, enqueues `enforce` if risk ≥ 80; on `coins.purchased`/`payout.requested` enqueues `risk_score_update`.  
  - **live_events** → `detectLiveAbuse(event)` — on `viewer.join`/`viewer.leave` enqueues `risk_score_update` for viewer userId.  
  - **moderation** / **moderation_events** → `handleModerationEvent(event)` — on `report.created` enqueues `risk_score_update` for targetId.
- **Producers:** Login (email + OAuth) → `AUTH_EVENTS`; activity.logged + behavior → `USER_ACTIVITY`; gift send → `PAYMENTS` (event `gift.sent`); existing `LIVE_EVENTS`, `MODERATION` unchanged.
- **Worker:** `workers/kafkaAbuseConsumer.js` registers handlers and starts the consumer; started in-process with the API when `KAFKA_ENABLED=true`.

---

## 17. Phase 6 (Advanced / Future): Graph + ML

- **Neo4j cluster detection:** Optional when `NEO4J_URI` + `NEO4J_PASSWORD` set. `neo4jClusterService.getClusterSignals(userId)` returns signals for gift ring, follow circle, account cluster; wired into risk engine. Admin: **GET /moderation/neo4j/gift-rings** returns user IDs in gift rings. See **docs/phase-6-graph-ml-architecture.md** for schema, Cypher sketches, and ETL.
- **Python ML workers:** Architecture: Kafka → Python ML Worker (Isolation Forest, Random Forest, LSTM, GNN) → risk score → Node enforcement. Not implemented in repo; see Phase 6 doc for contract (Kafka topics, HTTP callback or `ml_risk_scores` topic, `ML_RISK_SERVICE_URL`).

---

## Full stack (after Phase 6)

| Component | Status |
|-----------|--------|
| Device fingerprinting | ✅ FingerprintJS, Device DNA, device reputation |
| Behavior analytics | ✅ Scroll, mouse, typing, session; human-likeness |
| Trust score engine | ✅ 0–100, factors, TrustHistory timeline |
| Unified enforcement engine | ✅ totalRisk → captcha / rate_limit / shadow_ban / manual_review / permanent_ban |
| ATO protection | ✅ LoginAudit, impossible travel, risk lock |
| Impossible travel detection | ✅ Geo + distance/time; risk lock + FraudEvent |
| Risk lock & verification | ✅ Step-up email OTP; admin clear; sensitive routes gated |
| Kafka abuse pipeline | ✅ user_activity, auth_events, payments, live_events, moderation → enforce |
| Graph bot detection | 🔲 Phase 6: Neo4j stub + doc; gift rings, follow circles, like farms |
| ML anomaly detection | ✅ Heuristic (shadow); 🔲 Phase 6: Python Isolation Forest, Random Forest, GNN, LSTM |
| Admin review workflow | ✅ Manual review queue, security dashboard, moderation |
| Trust timeline dashboard | ✅ GET /admin/trust/:userId/history |

**Outcome:** Discovery is resistant to fake views, like farms, comment bots, bot clusters, trend hijacking, fake virality, and coordinated engagement. The feed algorithm only promotes authentic content (CAS, trend eligibility, trend hijacking, creator manipulation, and—when enabled—ML scores).

---

## Validation

- Phase 20: `npm run validate:phase20` (CSP, HSTS, rate limit, ledger, kill-switches, nginx, infra docs).
- Phase 11: Fraud signals, device fingerprint, payment evaluation, multi-account detection.
- All admin actions and overrides logged to AdminAuditLog.
