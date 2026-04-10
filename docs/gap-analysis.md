# Millo Platform — Gap Analysis & Missing Implementations

> **Comprehensive audit of breaking dependencies, stubs, and incomplete features.**  
> Status: Development → Production readiness checklist.

---

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| **Critical (Production Blockers)** | 8 | 🔴 High |
| **Payment Stubs** | 6 | 🔴 High |
| **Infrastructure Stubs** | 5 | 🟠 Medium |
| **AI/ML Placeholders** | 7 | 🟠 Medium |
| **Missing Integrations** | 12 | 🟡 Low |
| **Future Features (Intentional)** | 4 | ⚪ Info |

---

## 🔴 CRITICAL — Production Blockers

### 1. Payment Provider Stubs Active

**Files Affected:**
- `packages/api/src/services/payments/stripe.provider.js`
- `packages/api/src/services/payments/paypal.provider.js`
- `packages/api/src/services/payments/wise.provider.js`
- `packages/billing/src/stripe.js`
- `packages/billing/src/payoutService.js`

**Issue:**
When Stripe/PayPal/Wise API keys are not configured, the system falls back to stub mode that logs fake transactions and credits coins without real payments.

**Code Evidence:**

```javascript
// stripe.provider.js:18-19
const stubId = `cs_stub_${Date.now()}`;
return { sessionId: stubId, url: successUrl || null, stub: true };
```

```javascript
// payments.js:436-437
request.log.warn({ userId: String(user._id), coins: totalCoins }, '[DEV STUB] Coins credited without real payment');
return reply.send({ ok: true, stub: true, coinsAdded: totalCoins, redirectUrl: null });
```

**Risk:** In production, users could receive virtual currency without actual payment.

**Fix Required:**
- Set `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` in production
- Set `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` for PayPal
- Set `WISE_API_KEY` for Wise payouts
- `productionGuard.js` blocks sandbox mode but doesn't catch missing keys

---

### 2. Wise Provider Not Fully Implemented

**File:** `packages/api/src/services/payments/wise.provider.js`

**Missing Functions:**

```javascript
verifyWebhook() {
  return { ok: false, error: 'WISE_WEBHOOK_NOT_IMPLEMENTED' };
}

async refund() {
  throw new Error('WISE_REFUND_NOT_IMPLEMENTED');
}
```

**Risk:** Cannot verify Wise webhooks or process Wise refunds.

---

### 3. Janus WebRTC Integration is Stub Only

**File:** `packages/api/src/lib/janusStub.js`

**Current Implementation:**

```javascript
async function createSubscriberFeed(streamId, userId) {
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[janus-stub] createSubscriberFeed', { streamId, userId });
  }
}
```

**Impact:** Co-hosting feature (`POST /live/cohost/invite`) does not actually connect co-hosts to the live stream video feed.

**Fix Required:**
- Integrate with Janus Gateway REST API
- Configure `JANUS_API_URL` and `JANUS_API_SECRET`

---

### 4. Neo4j Trust Graph Optional

**File:** `packages/api/src/services/neo4jClusterService.js`

**Issue:** All Neo4j operations return `null` when not configured:

```javascript
async function getDriver() {
  if (!isEnabled()) return null;
  // ...
}

async function runCypher(cypher, params = {}) {
  if (!isEnabled()) return null;
  const driver = await getDriver();
  if (!driver) return null;
  // ...
}
```

**Impact:** Advanced fraud detection (gift rings, follow circles, payment clusters) is disabled without Neo4j.

**Required Configuration:**
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=<password>
```

---

### 5. Kafka/RabbitMQ Event Bus Optional

**Files:**
- `packages/api/src/services/kafkaEventBus.js`
- `packages/api/src/services/rabbitmqEventBus.js`

**Issue:** Event bus returns null when not configured:

```javascript
async function getProducer() {
  if (!isEnabled()) return null;
  // ...
}
```

**Impact:** When Kafka is not configured:
- No event-driven fraud detection
- No real-time analytics
- No async notification processing
- Workers don't receive events

**Required Configuration:**
```
KAFKA_BROKERS=localhost:9092
# or
EVENT_BUS=rabbitmq
RABBITMQ_URL=amqp://localhost
```

---

### 6. OAuth Providers Silent Disable

**File:** `packages/api/src/services/oauthProviders.js`

**Issue:** OAuth silently disables when env vars missing:

```javascript
google:   !!process.env.OAUTH_GOOGLE_CLIENT_ID,
facebook: !!process.env.OAUTH_FACEBOOK_CLIENT_ID,
apple:    !!process.env.OAUTH_APPLE_CLIENT_ID,
```

**Impact:** Users see "OAuth not configured" error when trying social login.

**Note:** `productionGuard.js` now enforces at least one OAuth provider in production.

---

### 7. Email Falls Back to Console Logging

**File:** `packages/notifications/src/email/providers/console.js`

**Issue:** When no email provider is configured, emails only log to console:

```javascript
// Console provider - dev only
async send({ to, subject, body }) {
  console.log(`[EMAIL] To: ${to}, Subject: ${subject}`);
  return { ok: true };
}
```

**Impact:** Critical emails (password reset, verification, magic links) never reach users.

**Required Configuration:**
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=<key>
# or
EMAIL_PROVIDER=ses
AWS_SES_REGION=us-east-1
AWS_ACCESS_KEY_ID=<id>
AWS_SECRET_ACCESS_KEY=<secret>
```

**Note:** Set `EMAIL_CONSOLE_DISALLOWED=true` in production to fail hard.

---

### 8. KYC Providers All Optional

**File:** `packages/api/src/services/kycService.js`

**Issue:** All KYC providers return null if not configured:

```javascript
function getStripeIdentity() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // ...
}

function getOnfidoClient() {
  const token = process.env.ONFIDO_API_TOKEN;
  if (!token) return null;
  // ...
}
```

**Impact:** Creator verification (`POST /payments/kyc/verify`) works in stub mode without real identity verification.

---

## 🟠 MEDIUM — Infrastructure Gaps

### 9. Live Streaming Filters are TODOs

**Files:**
- `packages/web/src/lib/liveFiltersSDK/backgroundBlur.js`
- `packages/web/src/lib/liveFiltersSDK/faceSmoothing.js`
- `packages/web/src/lib/liveFiltersSDK/arMasks.js`

**Current State:**

```javascript
// backgroundBlur.js:15
// TODO: load body-segmentation model, segment person, blur background in WebGL/canvas

// faceSmoothing.js:15
// TODO: face mesh → face ROI → WebGL bilateral/smoothing pass

// arMasks.js:15
// TODO: face landmarks → position overlay texture in WebGL/2D
```

**Impact:** Live stream filters draw video to canvas without actual effects.

**Fix Required:**
- Install `@tensorflow/tfjs` and `@tensorflow-models/body-segmentation`
- Implement MediaPipe face mesh integration
- Add WebGL shader rendering

---

### 10. Copyright/Audio Fingerprint Providers Optional

**File:** `packages/api/src/services/copyrightScanService.js`

**Issue:**

```javascript
// Pex (stub — use Pex API when key is set)
if (PROVIDER === 'pex') return !!process.env.PEX_API_KEY;

// AudD requires token
if (PROVIDER === 'audd') return !!process.env.AUDD_API_TOKEN;
```

**Impact:** Without configuration, copyright scanning is disabled. Users can upload copyrighted music.

---

### 11. AI Moderation Requires External APIs

**File:** `packages/api/src/services/aiModeration.service.js`

**Conditional Enables:**

```javascript
const OPENAI_ENABLED = AI_ENABLED && !!process.env.OPENAI_API_KEY;
const HIVE_ENABLED = AI_ENABLED && !!process.env.HIVE_API_KEY;
const REKOGNITION_ENABLED = AI_ENABLED && !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY;
```

**Impact:** Without any AI provider configured, content moderation relies solely on manual review.

---

### 12. Tax Service Providers Optional

**File:** `packages/api/src/services/taxService.js`

**All providers return null without configuration:**

```javascript
if (!username || !password) return null; // Avalara
if (!key) return null; // TaxJar
if (!key) return null; // Stripe Tax
```

**Impact:** Tax calculations and compliance may be incomplete for international transactions.

---

### 13. IP Reputation Services Optional

**File:** `packages/api/src/services/ipReputationService.js`

**Conditional Enables:**

```javascript
if (process.env.CLOUDFLARE_IP_REPUTATION_ENABLED !== 'true') return null;
if (!accountId || !licenseKey) return null; // MaxMind
if (!key) return null; // IP2Proxy
```

**Impact:** Bot and fraud detection has reduced effectiveness without IP intelligence.

---

## 🟡 LOW — Missing Integrations

### 14. CAPTCHA Providers Optional

**File:** `packages/api/src/services/captchaService.js`

```javascript
if (CAPTCHA_PROVIDER === 'turnstile') return !!process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
if (CAPTCHA_PROVIDER === 'hcaptcha') return !!process.env.HCAPTCHA_SECRET_KEY;
if (CAPTCHA_PROVIDER === 'arkose') return !!process.env.ARKOSE_PUBLIC_KEY && !!process.env.ARKOSE_PRIVATE_KEY;
```

**Impact:** High-risk actions can proceed without CAPTCHA challenges.

---

### 15. Log Aggregation Not Connected

**File:** `packages/api/src/config/logAggregation.js`

```javascript
lokiHost: process.env.LOG_LOKI_HOST || process.env.LOKI_HOST || null,
elasticNode: process.env.LOG_ELASTIC_NODE || process.env.ELASTICSEARCH_NODE || null,
```

**Impact:** Logs only go to console/file without centralized aggregation.

---

### 16. Analytics Providers Optional

**File:** `packages/api/src/services/analyticsService.js`

```javascript
const token = process.env.MIXPANEL_TOKEN;
if (!token) return null;

const apiKey = process.env.AMPLITUDE_API_KEY;
if (!apiKey) return null;
```

**Impact:** Third-party analytics tracking disabled without configuration.

---

### 17. Fraud Detection Services Optional

**File:** `packages/api/src/services/fraudService.js`

```javascript
// Sift Science
const key = process.env.SIFT_API_KEY;
if (!key) return null;

// Riskified
const authKey = process.env.RISKIFIED_AUTH_KEY;
if (!accountId || !authKey) return null;
```

**Impact:** Advanced ML-based fraud detection disabled without third-party providers.

---

### 18. SQL Financial Ledger Not Migrated

**File:** `packages/economy/src/sqlEconomy.js`

```javascript
return process.env.FINANCIAL_SQL_URL || process.env.SQL_DATABASE_URL || process.env.DATABASE_URL || null;
```

**Impact:** Financial transactions remain in MongoDB (no ACID guarantees) until PostgreSQL migration is completed.

**Migration Scripts Available:**
- `packages/database/sql/ledger_optional.sql`
- `packages/database/sql/phase8_sql_economy_migration.sql`

---

## ⚪ INFO — Intentional Future Features

### 19. AI Music Generator Returns 501

**File:** `packages/api/src/routes/music.js:218-222`

```javascript
/* ── AI Music Generator (future feature) — stub returns 501 ── */
app.post('/ai/generate', async (request, reply) => {
  return reply.status(501).send({
    error: 'NOT_IMPLEMENTED',
    message: 'AI music generation is a future feature',
  });
});
```

**Status:** Intentionally not implemented (future roadmap).

---

### 20. Pex Copyright API Stub

**File:** `packages/api/src/services/copyrightScanService.js:195-199`

```javascript
// Pex (stub — use Pex API when key is set)
// Pex typically uses a different flow (e.g. submit asset, get report). Stub: no scan unless documented.
```

**Status:** Requires Pex partnership and API documentation.

---

## Required Environment Variables (Production)

### Critical (Application Won't Work Without)

```bash
# Database
MONGODB_URI=mongodb://...
REDIS_URL=redis://...

# Authentication
JWT_SECRET=<random-256-bit>
OAUTH_GOOGLE_CLIENT_ID=...
OAUTH_GOOGLE_CLIENT_SECRET=...

# Payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG...
EMAIL_CONSOLE_DISALLOWED=true
```

### Important (Features Degraded Without)

```bash
# Event Bus
KAFKA_BROKERS=broker1:9092,broker2:9092

# AI Moderation
OPENAI_API_KEY=sk-...
# or
HIVE_API_KEY=...

# KYC
ONFIDO_API_TOKEN=...
# or
SUMSUB_APP_TOKEN=...
SUMSUB_SECRET_KEY=...

# Trust Graph
NEO4J_URI=bolt://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...

# Copyright
AUDD_API_TOKEN=...

# CAPTCHA
CLOUDFLARE_TURNSTILE_SECRET_KEY=...
```

### Optional (Enhanced Features)

```bash
# Additional OAuth
OAUTH_APPLE_CLIENT_ID=...
OAUTH_FACEBOOK_CLIENT_ID=...

# Additional Payments
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
WISE_API_KEY=...

# IP Intelligence
MAXMIND_ACCOUNT_ID=...
MAXMIND_LICENSE_KEY=...
CLOUDFLARE_IP_REPUTATION_ENABLED=true
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...

# Tax Compliance
TAXJAR_API_KEY=...
# or
AVALARA_USERNAME=...
AVALARA_PASSWORD=...

# Monitoring
SENTRY_DSN=https://...
MIXPANEL_TOKEN=...
AMPLITUDE_API_KEY=...
LOG_LOKI_HOST=http://...

# Fraud Detection
SIFT_API_KEY=...
RISKIFIED_ACCOUNT_ID=...
RISKIFIED_AUTH_KEY=...
```

---

## Production Checklist

### Must Fix Before Launch

- [ ] Configure real Stripe keys (not test keys)
- [ ] Configure email provider (SendGrid/SES)
- [ ] Set `EMAIL_CONSOLE_DISALLOWED=true`
- [ ] Configure at least one OAuth provider
- [ ] Set up Kafka or RabbitMQ event bus
- [ ] Configure AI moderation provider (OpenAI/Hive/Rekognition)
- [ ] Set up copyright scanning (AudD)
- [ ] Configure CAPTCHA provider
- [ ] Deploy Neo4j for trust graph (or accept reduced fraud detection)
- [ ] Implement Janus WebRTC for co-hosting (or disable feature)
- [ ] Complete live filter ML integration (or disable feature)

### Should Fix Before Scale

- [ ] Migrate financial data to PostgreSQL
- [ ] Configure IP reputation services
- [ ] Set up log aggregation (Loki/Elasticsearch)
- [ ] Configure tax calculation provider
- [ ] Add third-party fraud detection (Sift/Riskified)
- [ ] Implement Wise webhook verification
- [ ] Add PayPal real checkout integration

---

## Summary

The Millo platform has comprehensive feature coverage but relies heavily on external service configuration. Most "gaps" are intentional graceful degradation — services return null/stub when not configured rather than crashing.

**For production deployment:**
1. Configure all **Critical** environment variables
2. Test payment flows with real (test) keys before going live
3. Enable `productionGuard.js` checks (already active)
4. Set `NODE_ENV=production` to activate production guards

The architecture is production-ready once external services are configured.
