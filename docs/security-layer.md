# Millo Security Layer

Enterprise-grade security architecture covering encryption, authentication, device fingerprinting, rate limiting, and compliance.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY LAYER                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Transport Security                                  │
│           TLS 1.3 · HSTS Preload · Certificate Pinning                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Edge Security (Cloudflare)                          │
│      DDoS Protection · WAF · Bot Management · Rate Limiting · IP Rep       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Application Security                                │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │ JWT Auth    │ Rate Limit  │ CSP Headers │ Device FP   │ Behavior    │   │
│  │ bcrypt      │ Redis Store │ Helmet      │ Fingerprint │ Analysis    │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Compliance Layer                                    │
│        GDPR · CCPA · PCI DSS · LGPD · PIPEDA · Age Gating                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. TLS 1.3 Encryption

### Transport Layer Security

All traffic encrypted with TLS 1.3 via Cloudflare edge.

| Feature | Configuration |
|---------|---------------|
| Protocol | TLS 1.3 (minimum TLS 1.2) |
| Certificate | Managed by Cloudflare |
| HSTS | Enabled with preload |
| Certificate Transparency | Required |

### HSTS Configuration

File: `packages/security/src/headers.js`

```javascript
const HSTS_MAX_AGE = 31536000;      // 1 year
const HSTS_INCLUDE_SUBDOMAINS = true;
const HSTS_PRELOAD = true;

function getHSTSHeader(options = {}) {
  const maxAge = options.maxAge ?? HSTS_MAX_AGE;
  let h = "max-age=" + maxAge;
  if (options.includeSubdomains !== false) h += "; includeSubDomains";
  if (options.preload !== false) h += "; preload";
  return h;
}
```

**Output Header:**
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## 2. JWT Authentication

### Token-Based Authentication

File: `packages/api/src/routes/auth.js`

```javascript
const jwt = require('jsonwebtoken');
const JWT_EXPIRES_IN = '30d';

function signJwt(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return jwt.sign(
    { sub: String(userId), iat: Math.floor(Date.now() / 1000) },
    secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
```

### JWT Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Algorithm | HS256 | HMAC with SHA-256 |
| Expiry | 30 days | Token lifetime |
| Claims | `sub`, `iat` | Subject (userId), issued at |
| Secret | `JWT_SECRET` env | Server-side secret |

### Session Storage

Sessions stored in MongoDB with expiry:

```javascript
{
  userId: ObjectId,
  tokenHash: String,    // SHA-256 hash of token
  expiresAt: Date,
  createdAt: Date,
  meta: {
    ip: String,
    userAgent: String,
  }
}
```

---

## 3. Password Security

### bcrypt Hashing

File: `packages/api/src/routes/auth.js`

```javascript
const bcrypt = require('bcryptjs');
const BCRYPT_ROUNDS = 12;

// Hash password
const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

// Verify password
const ok = await bcrypt.compare(password, hash);
```

### Password Policy

| Requirement | Validation |
|-------------|------------|
| Minimum Length | 8 characters |
| Cost Factor | 12 rounds |
| Storage | bcrypt hash only |
| Reset | Magic link or token-based |

---

## 4. Device Fingerprinting

### TikTok-Style Device Tracking

File: `packages/api/src/routes/security.js`

```javascript
app.post('/security/device', async (request, reply) => {
  const { visitorId, userAgent, screen, timezone, signals, ...meta } = request.body;
  
  await fraudService.recordDevice(user._id, visitorId, {
    ip: request.ip,
    userAgent: userAgent || request.headers['user-agent'],
    timezone,
    screen,
    visitorId,
    meta,
  });
  
  if (signals) {
    await deviceReputationService.recordSignals(visitorId, signals);
  }
});
```

### Fingerprint Signals

| Signal | Description |
|--------|-------------|
| `visitorId` | FingerprintJS unique ID |
| `userAgent` | Browser/device string |
| `screen` | Screen resolution |
| `timezone` | User timezone |
| `canvas` | Canvas fingerprint |
| `webgl` | WebGL fingerprint |
| `fonts` | Installed fonts hash |

### Client Integration

```javascript
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export async function getDeviceFingerprint() {
  const fp = await FingerprintJS.load();
  const result = await fp.get();

  return {
    visitorId: result.visitorId,
    userAgent: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}
```

---

## 5. CSP Headers

### Content Security Policy

File: `packages/security/src/headers.js`

```javascript
const CSP_DEFAULT = `
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data:;
  font-src 'self';
  connect-src 'self' https://api.milloapp.com wss://api.milloapp.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self'
`;

function getCSPHeader(value) {
  return value || process.env.CSP_HEADER || CSP_DEFAULT;
}
```

### CSP Directives

| Directive | Policy | Purpose |
|-----------|--------|---------|
| `default-src` | 'self' | Fallback for all resources |
| `script-src` | 'self' | JavaScript sources |
| `style-src` | 'self' 'unsafe-inline' | CSS sources |
| `img-src` | 'self' https: data: | Image sources |
| `connect-src` | API + WSS | API/WebSocket connections |
| `frame-ancestors` | 'none' | Prevent framing (clickjacking) |
| `base-uri` | 'self' | Base URL restriction |
| `form-action` | 'self' | Form submission targets |

---

## 6. Security Headers (Helmet)

### Fastify Helmet Configuration

File: `packages/api/src/app.js`

```javascript
await app.register(require('@fastify/helmet'), {
  contentSecurityPolicy: false,  // Custom CSP via onSend
  crossOriginEmbedderPolicy: false,
  hsts: false,                   // Custom HSTS via onSend
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xContentTypeOptions: true,
  xFrameOptions: { action: 'deny' },
  xXssProtection: true,
  permittedCrossDomainPolicies: false,
  dnsPrefetchControl: { allow: false },
});
```

### Response Headers

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
X-DNS-Prefetch-Control: off
Content-Security-Policy: <custom CSP>
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

---

## 7. Rate Limiting

### Global Rate Limiting

File: `packages/security/src/rateLimit.js`

```javascript
const DEFAULT_MAX = 100;
const DEFAULT_TIME_WINDOW_MS = 60 * 1000; // 1 minute

function getRateLimitConfig() {
  return {
    max: Number(process.env.RATE_LIMIT_MAX) || DEFAULT_MAX,
    timeWindow: Number(process.env.RATE_LIMIT_TIME_WINDOW_MS) || DEFAULT_TIME_WINDOW_MS,
  };
}
```

### Per-Route Rate Limits

| Endpoint Category | Max Requests | Time Window |
|-------------------|--------------|-------------|
| Global (default) | 100 | 1 minute |
| Auth (login/register) | 5 | 10 minutes |
| Password reset | 3 | 1 hour |
| Payments | 20 | 1 minute |
| Payouts | 5 | 1 minute |
| Behavior events | 120 | 1 minute |
| Reports | 10 | 10 minutes |

### Route-Specific Configuration

```javascript
// Auth rate limit
const AUTH_RATE_LIMIT = {
  max: 5,
  timeWindow: '10 minutes',
  errorResponseBuilder: () => ({
    error: 'RATE_LIMITED',
    message: 'Too many login attempts'
  }),
};

app.post('/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, ...);
```

### Redis-Backed Rate Limiting

File: `packages/api/src/lib/rateLimitRedisStore.js`

```javascript
function createRateLimitRedisStore(timeWindowMs) {
  const redis = getRedis();
  const ttlSec = Math.ceil(timeWindowMs / 1000);

  function incr(key, cb) {
    const fullKey = 'rate_limit:' + key;
    redis.multi()
      .incr(fullKey)
      .pttl(fullKey)
      .exec()
      .then(([[, count], [, pttl]]) => {
        if (pttl === -1) redis.expire(fullKey, ttlSec);
        cb(null, { current: count, ttl: pttl > 0 ? pttl : ttlSec * 1000 });
      });
  }

  return { incr };
}
```

---

## 8. Behavioral Biometrics

### Mouse/Scroll/Typing Analysis

File: `packages/api/src/routes/security.js`

```javascript
app.post('/security/behavior', { config: { rateLimit: BEHAVIOR_RATE_LIMIT } }, async (request, reply) => {
  const { eventType, metadata, timestamp, sessionId } = request.body;
  
  // Biometric event types
  const isBiometric = behaviorMetricsService.ALLOWED_EVENT_TYPES.includes(eventType);
  
  if (isBiometric) {
    await behaviorMetricsService.trackBehavior(user._id, eventType, {
      x: body.x,
      y: body.y,
      speed: body.speed,
      velocity: body.velocity,
      interval: body.interval,
      duration: body.duration,
    });
  }
});
```

### Biometric Event Types

| Event Type | Data Collected | Bot Detection Signal |
|------------|----------------|---------------------|
| `mouse_move` | x, y, speed | Movement patterns |
| `scroll_speed` | velocity | Scroll behavior |
| `typing_latency` | interval | Typing rhythm |
| `session_duration` | duration | Session length |
| `click` | x, y, timing | Click patterns |

---

## 9. Kill Switches

### Emergency Feature Toggles

File: `packages/security/src/killSwitchRegistry.js`

```javascript
const REGISTRY = [
  { id: 'ADS_ENABLED', envKey: 'ADS_ENABLED', enforcedIn: '@millo/ads' },
  { id: 'MILLA_ENABLED', envKey: 'MILLA_ENABLED', enforcedIn: '@millo/milla' },
  { id: 'LIVE_FILTERS_ENABLED', envKey: 'LIVE_FILTERS_ENABLED', enforcedIn: 'API /live/filters' },
  { id: 'AI_OPTIMIZATION_ENABLED', envKey: 'AI_OPTIMIZATION_ENABLED', enforcedIn: '@millo/ai-optimization' },
];

function getKillSwitchRegistry() {
  return REGISTRY.map((k) => ({
    ...k,
    currentValue: process.env[k.envKey],
  }));
}
```

### Admin API

```javascript
GET /security/kill-switches    // List all switches
POST /dashboards/admin/kill-switch  // Toggle switch
```

---

## 10. GDPR Compliance

### Data Subject Rights

File: `packages/compliance/src/dsar.js`

| Right | Endpoint | Description |
|-------|----------|-------------|
| Access | `GET /dsar/export` | Export all user data |
| Erasure | `POST /dsar/delete` | Delete user data |
| Rectification | `POST /dsar/request` | Request data correction |
| Restriction | `POST /dsar/request` | Restrict processing |

### Data Export

```javascript
async function exportUserData(userId) {
  const [
    user,
    profile,
    sessions,
    wallet,
    ledgerEntries,
    transactions,
    reports,
    moderationLogs,
    tickets,
    consentLogs,
    appeals,
    payoutRequests,
    auditLogs,
    liveStreams,
    notifications,
    subscriptions,
    paymentTransactions,
    paymentMethods,
  ] = await Promise.all([...]);

  return {
    exportDate: new Date().toISOString(),
    userId,
    user,
    profile,
    sessions,
    wallet,
    balanceCents,
    ledgerEntries,
    // ... all user data
  };
}
```

### Data Deletion

```javascript
async function deleteUserData(userId, opts) {
  const { immediate = false } = opts;
  const DELETION_GRACE_DAYS = 30;
  
  if (!immediate) {
    // Schedule deletion after grace period
    return { scheduled: true, deletionScheduledAt: new Date(Date.now() + DELETION_GRACE_DAYS * DAY) };
  }

  // Immediate deletion: anonymize and remove PII
  await Promise.all([
    db.Session.deleteMany({ userId }),
    db.Profile.deleteOne({ userId }),
    db.Wallet.deleteMany({ userId }),
    db.PaymentMethod.deleteMany({ userId }),
    db.ConsentLog.deleteMany({ userId }),
    db.Notification.deleteMany({ userId }),
    db.Follow.deleteMany({ $or: [{ followerId: userId }, { followingId: userId }] }),
    // ... more deletions
  ]);

  // Anonymize user record (retain for audit)
  await db.User.findByIdAndUpdate(userId, {
    email: `deleted_${userId}_${Date.now()}`,
    flags: { deletedAt: new Date().toISOString() }
  });
}
```

---

## 11. CCPA Compliance

### Do Not Sell

File: `packages/compliance/src/consent.js`

```javascript
const CCPA_DO_NOT_SELL_PURPOSE = 'ccpa_do_not_sell';

async function getCcpaDoNotSellStatus(userId) {
  const log = await db.ConsentLog.findOne({ userId, purpose: CCPA_DO_NOT_SELL_PURPOSE })
    .sort({ createdAt: -1 })
    .lean();
  return { optedOut: log ? log.granted : false, lastUpdated: log?.createdAt };
}

async function logCcpaDoNotSell(userId, optedOut, options = {}) {
  return logConsent(userId, CCPA_DO_NOT_SELL_PURPOSE, options.version || '1', optedOut, options);
}
```

### Consent Logging

```javascript
async function logConsent(userId, purpose, version, granted, options = {}) {
  // Respect IP logging opt-out
  let ip = options.ip;
  if (ip && purpose !== IP_LOGGING_PURPOSE) {
    const status = await getIpLoggingStatus(userId);
    if (!status.allowIpLogging) ip = null;
  }

  await db.ConsentLog.create({
    userId,
    purpose,
    version,
    granted: Boolean(granted),
    ip,
    userAgent: options.userAgent,
    meta: options.meta,
  });
}
```

---

## 12. PCI DSS Compliance

### Payment Card Security

Millo achieves PCI DSS compliance through **tokenization** — no card data is stored or processed on Millo servers.

| Requirement | Implementation |
|-------------|----------------|
| Card Data Storage | Never stored — Stripe handles |
| Tokenization | Stripe PaymentIntent + Elements |
| Transmission | TLS 1.3 to Stripe |
| Authentication | Stripe publishable/secret keys |
| Fraud Detection | Stripe Radar integration |

### Stripe Integration

```javascript
// Create PaymentIntent (server-side)
const result = await stripe.createPaymentIntent(amountCents, idKey, {
  userId: user._id,
  packId,
  currency,
  email: user.email,
  radarMetadata: fraudService.getStripeRadarMetadata(user._id, fraudOpts),
});

// Return client_secret to frontend — card details never touch Millo servers
return reply.send({ ok: true, clientSecret: result.clientSecret });
```

### Fraud Prevention Metadata

```javascript
// Stripe Radar metadata for fraud detection
function getStripeRadarMetadata(userId, opts) {
  return {
    user_id: String(userId),
    ip_address: opts.ip,
    device_fingerprint: opts.deviceFingerprint,
    user_agent: opts.userAgent,
  };
}
```

---

## 13. Age Gating

### COPPA Compliance

File: `packages/compliance/src/ageGating.js`

```javascript
const MINIMUM_AGE_YEARS = 13;

async function isAgeAllowed(userId, minimumAgeYears = MINIMUM_AGE_YEARS) {
  const age = await getAge(userId);
  if (age === null) return { allowed: null, reason: 'age_unknown' };
  if (age < minimumAgeYears) return { allowed: false, age, reason: 'below_minimum' };
  return { allowed: true, age };
}

function ageFromDateOfBirth(dateOfBirth) {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
```

---

## 14. Data Retention

### Audit Data Retention Policy

File: `packages/compliance/src/retention.js`

| Data Type | Retention Period | Purge Method |
|-----------|------------------|--------------|
| Moderation Logs | 7 years | `purgeExpiredModerationData()` |
| Admin Audit Logs | 7 years | `purgeExpiredAdminAuditData()` |
| Financial Audit Logs | 7 years | `purgeExpiredFinancialAuditData()` |

```javascript
const MODERATION_AUDIT_RETENTION_YEARS = 7;
const ADMIN_AUDIT_RETENTION_YEARS = 7;
const FINANCIAL_AUDIT_RETENTION_YEARS = 7;

async function purgeAllExpiredAuditData() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  
  await db.ModerationLog.deleteMany({ createdAt: { $lt: cutoff } });
  await db.AdminAuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  await db.FinancialAuditLog.deleteMany({ createdAt: { $lt: cutoff } });
}
```

---

## 15. CORS Configuration

### Cross-Origin Resource Sharing

File: `packages/api/src/app.js`

```javascript
const corsOrigin = process.env.CORS_ORIGIN || 'https://milloapp.com';
const corsOrigins = corsOrigin.split(',').map((o) => o.trim());

await app.register(require('@fastify/cors'), {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role', 'X-Client'],
});
```

---

## 16. Request Tracing

### X-Request-Id

```javascript
app.addHook('onRequest', (request, reply, done) => {
  const reqId = request.headers['x-request-id'] || crypto.randomUUID();
  request.requestId = reqId;
  reply.header('X-Request-Id', reqId);
  done();
});
```

---

## 17. Content-Type Enforcement

### Mutation Endpoint Validation

```javascript
app.addHook('preHandler', (request, reply, done) => {
  const method = request.method;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const ct = (request.headers['content-type'] || '').toLowerCase();
    const isMultipart = ct.includes('multipart/form-data');
    const isWebhook = path.includes('/webhooks/');
    
    if (!isWebhook && !isMultipart && !ct.includes('application/json')) {
      return reply.status(415).send({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Content-Type must be application/json'
      });
    }
  }
  done();
});
```

---

## Summary

### Security Features

| Category | Implementation |
|----------|----------------|
| Transport | TLS 1.3, HSTS preload |
| Authentication | JWT (HS256, 30d), bcrypt (cost 12) |
| Device Security | FingerprintJS, behavioral biometrics |
| Headers | Helmet, CSP, X-Frame-Options |
| Rate Limiting | Fastify rate-limit + Redis store |
| Fraud | Stripe Radar, device reputation |
| Kill Switches | Feature toggles via env vars |

### Compliance

| Regulation | Implementation |
|------------|----------------|
| GDPR | DSAR (export, delete), consent logging, 30-day grace |
| CCPA | Do Not Sell opt-out, data export |
| PCI DSS | Stripe tokenization, no card storage |
| COPPA | Age gating (13+ minimum) |
| Data Retention | 7-year audit logs, automated purge |

### Environment Variables

```bash
# Security
JWT_SECRET=<secret>
BCRYPT_ROUNDS=12
CSP_HEADER=<custom CSP>

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIME_WINDOW_MS=60000
RATE_LIMIT_USE_REDIS=true

# CORS
CORS_ORIGIN=https://milloapp.com,https://admin.milloapp.com

# Compliance
MODERATION_AUDIT_RETENTION_YEARS=7
ADMIN_AUDIT_RETENTION_YEARS=7
FINANCIAL_AUDIT_RETENTION_YEARS=7
```
