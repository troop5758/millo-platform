# Phase 6 — Graph Bot Detection & ML Pipeline (Advanced / Future)

Architecture for Neo4j cluster detection and Python ML workers. When implemented, Millo will have enterprise anti-abuse protection comparable to TikTok/Twitch. This feeds into the **Adaptive Risk Engine** (rules + ML + feedback loop); see **docs/enterprise-protection-stack.md** (§ Concept: Adaptive Risk Engine).

---

## Concept: Global Trust Graph

The system models platform activity as a **graph** (not only tables): users, devices, content, and relationships (uses, posts, likes, receives gift). This enables:

- **Device clusters:** User A, B, C ── use ── Device X ⇒ 3 accounts → same device → suspicious cluster (see **botGraphDetection.getClusterByDevice**; Neo4j: `SAME_DEVICE` edges).
- **Gift fraud rings:** A receives gift from B, B from C, C from A ⇒ cycle reveals a gift ring (see **fraudService** gift graph + cycle detection; Neo4j: `GIFT_SENT` cycle queries).

See **docs/enterprise-protection-stack.md** (§ Concept: Global Trust Graph, §5 Graph Cluster Detection, §14l Gift Ring Detection).

### Entities in the Trust Graph (node types)

| Node Type       | Example                    |
|-----------------|----------------------------|
| **User**        | Creator or viewer          |
| **Device**      | Browser/device fingerprint |
| **IP**          | Network address            |
| **Content**     | Video or livestream        |
| **Payment**     | Card / Stripe / PayPal     |
| **Transaction** | Gift / payment             |
| **Session**     | Login session              |
| **Hashtag**     | Trending topic             |

Neo4j (Phase 6) and MongoDB-backed detection use subsets of these (e.g. User, Device, IP, and edges like GIFT_SENT, SAME_DEVICE); the full set defines the canonical trust-graph entity model.

**Graph relationships (edge types):**

| Relationship   | Meaning                        |
|-----------------|--------------------------------|
| **USES_DEVICE** | User logged in with device     |
| **LOGGED_FROM** | Session → IP                   |
| **POSTED**      | Creator uploaded content       |
| **LIKED**       | Engagement                     |
| **COMMENTED**   | Comment interaction            |
| **GIFTED**      | Gift transaction               |
| **PAID**        | Subscription / payment        |
| **BID_ON**      | Auction interaction            |
| **FOLLOWS**     | Social relationship           |

---

## 1. Graph Bot Detection (Neo4j)

### Purpose

Move beyond MongoDB-based cluster heuristics to **graph-native** detection of:

| Pattern | Description | Neo4j use |
|--------|--------------|------------|
| **Account clusters** | Many accounts sharing device/IP, same-day signup, dense mutual links | Community detection (Louvain, Label Propagation), degree centrality |
| **Gift rings** | A → B → C → A gift flows; circular revenue or karma farming | Cycle detection, directed weighted edges |
| **Like farms** | Same set of users liking the same creators in lockstep | Bipartite clustering, temporal correlation |
| **Follow circles** | Mutual follow cliques; follow-back rings | Strongly connected components, reciprocity metrics |

### Neo4j Schema (Target)

- **Nodes (subset of Trust Graph entities):** `User(id)`, `Device(id)`, `IP(addr)`; optionally `Content(id)`, `Transaction(id)`, `Session(id)`, `Hashtag(tag)` for richer detection. See **Entities in the Trust Graph** above for the full node-type list.
- **Edges (aligned with Trust Graph relationships):** `USES_DEVICE(user, device)`, `LOGGED_FROM(session, ip)`, `POSTED(user, content)`, `LIKED(user, content)`, `COMMENTED(user, content)`, `GIFTED(from, to, amount)`, `PAID(user, payment)`, `BID_ON(user, auction)`, `FOLLOWS(from, to)`; legacy/alias: `GIFT_SENT` ≡ `GIFTED`, `LIKES` ≡ `LIKED`, `SAME_DEVICE(user, device)`, `SAME_IP(user, ip)` for cluster detection.
- **Sync:** ETL from MongoDB (Follow, StreamLike, LedgerEntry/gift, DeviceFingerprint, LoginAudit) into Neo4j on a schedule or via Kafka (see **Graph Ingestion Pipeline** below).

### Graph Ingestion Pipeline

Activity events update the trust graph in **real time**.

**Architecture:**

```
User Activity
      │
      ▼
Kafka Events
      │
      ▼
Graph Ingestion Worker
      │
      ▼
Neo4j Trust Graph
```

- **User Activity:** Gifts, logins, likes, posts, comments, payments, bids, follows (emitted by API when actions occur).
- **Kafka Events:** Same topics as abuse pipeline (e.g. `payments`, `auth_events`, `user_activity`) or a dedicated `trust_graph_events` topic; events are consumed by the Graph Ingestion Worker.
- **Graph Ingestion Worker:** Consumes events, maps each event type to Trust Graph relationships, and writes nodes/edges to Neo4j (merge User/Device/IP/Content nodes; create or update USES_DEVICE, GIFTED, LIKED, POSTED, etc.).
- **Neo4j Trust Graph:** Stays up to date for real-time or near-real-time cluster and ring detection.

**Example Kafka event (gift):**

```json
{
  "eventType": "gift_sent",
  "sender": "userA",
  "receiver": "userB",
  "device": "deviceX",
  "amount": 50
}
```

**Worker behavior:** On `gift_sent`, the worker writes graph relationships: ensure User nodes for sender/receiver and Device node for device; create `(sender)-[:GIFTED]->(receiver)` (with amount/timestamp if stored on the edge); create or merge `(sender)-[:USES_DEVICE]->(device)`. Other event types (e.g. `login` → USES_DEVICE/LOGGED_FROM, `liked` → LIKED, `posted` → POSTED) are mapped similarly.

**Implementation:** `packages/api/src/workers/trustGraphWorker.js` — `processEvent(event)` handles `login` (MERGE User, Device, USES_DEVICE) and `gift` / `gift_sent` (MERGE User pair, GIFTED). `registerKafkaHandlers()` registers with the Kafka abuse consumer so `auth_events` and `payments` events are ingested into Neo4j when `NEO4J_URI` is set. Neo4j writes use `neo4jClusterService.runCypher(cypher, params)`.

### Detection Queries (Cypher Sketches)

- **Bot farm (device fan‑out):** Many accounts on one device all engaging the same content.
  ```cypher
  MATCH (d:Device)<-[:USES_DEVICE]-(u:User)
  WITH d, count(u) AS users
  WHERE users > 20
  RETURN d
  ```
- **Gift ring (3‑cycle):** A → B → C → A gift flows; circular revenue ring.
  ```cypher
  MATCH (a:User)-[:GIFTED]->(b:User)-[:GIFTED]->(c:User)-[:GIFTED]->(a)
  RETURN a,b,c
  ```
- **Like farm / fake engagement cluster:** Accounts repeatedly liking the same content set.
  ```cypher
  MATCH (u1:User)-[:LIKED]->(c:Content)<-[:LIKED]-(u2:User)
  WHERE u1 <> u2
  RETURN u1,u2,count(c) AS sharedLikedContent
  ORDER BY sharedLikedContent DESC
  ```
- **Follow circle:** `MATCH (a:User)-[:FOLLOWS]->(b)-[:FOLLOWS]->(c)-[:FOLLOWS]->(a) RETURN a,b,c`.
- **Account cluster:** Subgraph of users connected by SAME_DEVICE or SAME_IP; run community detection (e.g. GDS library).

### Trust Graph Risk Scoring

Graph signals contribute to the risk engine. Example signal → risk mapping:

| Signal | Risk |
|--------|------|
| shared device cluster | +40 |
| gift ring | +50 |
| fake engagement cluster | +30 |
| payment cluster | +50 |

**Risk calculation:**  
`riskScore = deviceClusterRisk + giftRingRisk + engagementClusterRisk + paymentClusterRisk` (plus other non-graph signals: likes/min, duplicate comments, no mouse, etc.).

**Implementation:** `riskEngine.calculateRisk(userId)` calls `neo4jClusterService.getClusterSignals(userId)` when Neo4j is enabled and adds: **TRUST_GRAPH_DEVICE_CLUSTER_RISK** (40), **TRUST_GRAPH_GIFT_RING_RISK** (50), **TRUST_GRAPH_ENGAGEMENT_CLUSTER_RISK** (30), **TRUST_GRAPH_PAYMENT_CLUSTER_RISK** (50) per detected signal. Env overrides: `RISK_TRUST_GRAPH_DEVICE_CLUSTER`, `RISK_TRUST_GRAPH_GIFT_RING`, `RISK_TRUST_GRAPH_ENGAGEMENT_CLUSTER`, `RISK_TRUST_GRAPH_PAYMENT_CLUSTER`.

### Graph-Based Creator Fraud Detection

The graph detects creator-level fraud: **fake gifts** (self-funding), **subscription farms**, **self-purchases**, **fake auction bids**.

**Example:** Creator A receives gifts from accounts B, C, D; B, C, D all share a device → graph reveals self-funding fraud.

| Pattern | Description |
|--------|-------------|
| Fake gifts (self-funding) | Creator receives gifts from multiple accounts that share one device. |
| Subscription farms | Many subscriptions to creator from accounts sharing device/IP. |
| Self-purchases | Creator-linked accounts buying own content/store. |
| Fake auction bids | Same-device or coordinated bidders inflating price. |

**Cypher (self-funding gifts):** Creator received gifts from 2+ distinct users who share a device:

```cypher
MATCH (creator:User {id: $creatorId})<-[:GIFTED]-(sender:User)-[:USES_DEVICE]->(d:Device)
WITH d, count(DISTINCT sender) AS senders
WHERE senders >= 2
RETURN max(senders) AS maxSenders
```

**Implementation:** `neo4jClusterService.getCreatorFraudGraphSignals(creatorId)` returns `{ selfFundingGifts, sharedDeviceGiftSenderCount, subscriptionFarm, fakeAuctionBids }`. When `selfFundingGifts` is true, `fraudService.getCreatorFraudScore` applies **CREATOR_GRAPH_SELF_FUNDING_PENALTY** (default 50). Subscription farm / fake auction bid signals are placeholders until PAID and BID_ON edges are ingested.

### Integration with Existing Stack

- **Optional service:** `neo4jClusterService.js` — when `NEO4J_URI` is set, runs Cypher (or calls a Neo4j-backed API); returns cluster IDs / risk signals.
- **riskEngine / enforcementEngine:** Trust graph signals (gift ring, device cluster, like farm, payment cluster) add to `calculateRisk`; combined score drives captcha / rate_limit / shadow_ban / manual_review / permanent_ban.
- **Admin dashboard:** Expose “Graph clusters” view (cluster ID, member count, pattern type).

---

## 2. Machine Learning Models (Python Workers)

### Models

Aligned with **§15 Machine Learning Upgrade (Future)** in `docs/enterprise-protection-stack.md`:

| Model | Purpose | Inputs | Output |
|-------|---------|--------|--------|
| **Isolation Forest** | Anomaly detection (unsupervised) | Feature vector: rate of actions, session length, device count, etc. | Anomaly score 0–1 |
| **Random Forest** | Bot classification / engagement fraud | Same + labels from moderation/enforcement | Class + probability |
| **LSTM** | Behavior sequences / engagement timing patterns | Time series of events (scroll, like, watch, pause) per session | Sequence risk score |
| **Graph Neural Network (GNN)** | Fraud networks / bot clusters / bot farm detection | Graph of users and edges (follow, like, gift) | Node-level risk or cluster membership |
| **Gradient Boosting** | Engagement fraud | Same tabular features as Random Forest; often used for ranking or calibrated probabilities | Score or class + probability |

### Architecture: Kafka → Python ML Worker → Risk Score → Enforcement

```
Kafka (user_activity, auth_events, payments, …)
    → Python ML Worker (consumes events, builds features, runs models)
    → Risk score (e.g. POST to API or publish to Kafka topic ml_risk_scores)
    → Node API / enforcement engine applies rules (existing enforce job)
```

### Python Worker Contract

- **Consume:** Same topics as Node abuse consumer (e.g. `user_activity`, `auth_events`, `payments`) or a dedicated `ml_events` topic.
- **Features:** Per user/session: counts, velocities, diversity, device/IP entropy, sequence embeddings (from LSTM), graph features (from GNN if available).
- **Output:** Either:
  - **HTTP callback:** `POST /internal/ml-risk` (admin-only or internal network) with `{ userId, score, model, signals }`, or
  - **Kafka:** Publish to `ml_risk_scores`; Node consumer enqueues `enforce` or updates a Redis/DB “ML score” used by enforcement engine.
- **Deployment:** Docker image; run as separate process(es). Optional: one container per model or one orchestrator that runs all four.

### Integration with Node

- **Enforcement engine:** Optional input “ML risk score” (e.g. from Redis key `ml_risk:{userId}` or from FraudEvent/API). Combine with existing `botScore`, `trustScore`, `fraudScore` (e.g. `totalRisk = max(..., mlScore)`).
- **Env:** `ML_RISK_SERVICE_URL` or `ML_RISK_KAFKA_TOPIC` to enable; when unset, Node skips ML contribution.

### Model Training Pipeline

Offline/scheduled pipeline that produces and deploys updated models:

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

- **Training Data:** ModerationTrainingData, MlFeatureSnapshot, FraudEvent, moderation outcomes.
- **Feature Engineering:** Build feature vectors; join with labels.
- **Model Training:** Train Isolation Forest, Random Forest, LSTM, GNN, Gradient Boosting.
- **Model Validation:** Holdout metrics; gate deployment on quality.
- **Model Deployment:** Publish new model versions; Node/workers consume via API or Kafka.

This pipeline should run **periodically** (e.g. daily or weekly). Example script: **ml/train_bot_model.py** (RandomForestClassifier; features: viewVelocity, deviceCluster, trustScore, engagementRatio; output: bot_model.pkl). See **docs/enterprise-protection-stack.md** (§ Concept: Adaptive Risk Engine, Model training pipeline).

---

## 3. Full Stack Summary (After Phase 6)

| Component | Status | Purpose |
|-----------|--------|---------|
| Device fingerprinting | ✅ | FingerprintJS, Device DNA, device reputation |
| Behavior analytics | ✅ | Scroll, mouse, typing, session; human-likeness score |
| Trust score engine | ✅ | 0–100, factors, risk levels; TrustHistory timeline |
| Unified enforcement engine | ✅ | totalRisk → captcha / rate_limit / shadow_ban / manual_review / permanent_ban |
| ATO protection | ✅ | LoginAudit, impossible travel, risk lock, step-up verification |
| Impossible travel detection | ✅ | Geo + distance/time; risk lock + FraudEvent |
| Risk lock & verification | ✅ | Step-up email OTP; admin clear; sensitive routes gated |
| Kafka abuse pipeline | ✅ | user_activity, auth_events, payments, live_events, moderation → handlers → enforce |
| **Graph bot detection** | 🔲 Phase 6 | Neo4j cluster detection: gift rings, like farms, follow circles |
| **ML anomaly detection** | ✅ (heuristic) / 🔲 (models) | Shadow-mode heuristics today; Phase 6: Isolation Forest, RF, LSTM, GNN |
| Admin review workflow | ✅ | Manual review queue (FraudEvent), security dashboard, moderation routes |
| Trust timeline dashboard | ✅ | GET /admin/trust/:userId/history |

---

## 4. Implementation Checklist (Phase 6)

- [ ] **Neo4j:** Deploy Neo4j; define ETL from MongoDB to graph; implement Cypher for gift ring, follow circle, like farm, account cluster.
- [x] **Graph Ingestion Worker:** `trustGraphWorker.js` — `processEvent(event)` for login (USES_DEVICE) and gift (GIFTED); registered via `registerKafkaHandlers()` with Kafka abuse consumer; uses `neo4jClusterService.runCypher`. Extend for LIKED, POSTED, etc. as needed.
- [ ] **neo4jClusterService.js:** Optional client in Node; when `NEO4J_URI` set, call Neo4j and return cluster/risk signals; feed into risk engine or enforcement.
- [ ] **Python ML worker repo:** Kafka consumer; feature pipeline; Isolation Forest, Random Forest, LSTM, GNN (or stubs); output risk score to API or Kafka.
- [ ] **Model training pipeline:** Scheduled job (daily or weekly): Training Data → Feature Engineering → Model Training → Model Validation → Model Deployment; see § Model Training Pipeline above.
- [ ] **Node:** Env `ML_RISK_SERVICE_URL` or Kafka consumer for `ml_risk_scores`; merge ML score into enforcement engine.
- [ ] **Admin:** “Graph clusters” and “ML scores” in security dashboard (read-only until review workflow is defined).

---

## 5. References

- Existing graph logic (MongoDB): `packages/api/src/services/botGraphDetection.js`
- Enforcement: `packages/api/src/services/enforcementEngine.js`
- Kafka abuse: `packages/api/src/workers/kafkaAbuseConsumer.js`, `kafkaAbuseHandlers.js`
- Enterprise stack overview: `docs/enterprise-protection-stack.md`
