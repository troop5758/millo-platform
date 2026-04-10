# Millo Admin Platform

Comprehensive admin dashboard for user management, content moderation, payments, fraud detection, and platform analytics.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ADMIN PLATFORM                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Admin Web UI (/admin)                               │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │  Dashboard  │    Users    │ Moderation  │  Payments   │   Security  │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┬─────────────┐   │
│  │  Analytics  │   Branding  │    DSAR     │  Kill Switch│    Fraud    │   │
│  └─────────────┴─────────────┴─────────────┴─────────────┴─────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Admin API Endpoints                                  │
│  • /dashboards/admin/*    • /admin/*    • /moderation/*    • /compliance/*  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
         ┌────────────┬───────────────┼───────────────┬────────────┐
         ▼            ▼               ▼               ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   User DB   │ │ Moderation  │ │   Payments  │ │   Fraud     │ │   Trust     │
│  Management │ │   Queue     │ │   Ledger    │ │   Events    │ │   Graph     │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 1. User Management

### Admin User CRUD

File: `packages/api/src/routes/dashboards.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/users` | GET | List users (search, paginate) |
| `/admin/users` | POST | Create user |
| `/admin/users/:id` | PATCH | Update user (email, role, status, flags) |
| `/admin/users/:id` | DELETE | Delete user and related data |
| `/dashboards/admin/users/:id` | GET | Get user details with profile |

### User Fields

```javascript
{
  email: String,
  role: 'user' | 'creator' | 'mod' | 'support' | 'admin',
  status: 'active' | 'suspended' | 'banned' | 'pending_verification',
  creatorStatus: 'none' | 'pending' | 'approved' | 'rejected',
  suspensionReason: String,
  flags: Object,
}
```

### User Actions

```javascript
// Suspend user
PATCH /admin/users/:id
{ status: 'suspended', suspensionReason: 'Policy violation' }

// Ban user
PATCH /admin/users/:id
{ status: 'banned', suspensionReason: 'Repeated violations' }

// Promote to admin
PATCH /admin/users/:id
{ role: 'admin' }
```

---

## 2. Content Moderation

### Moderation Queue

File: `packages/api/src/routes/moderation.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/moderation/queue` | GET | List pending content (status, pagination) |
| `/moderation/queue/:id` | PATCH | Approve/reject/review content |
| `/moderation/report` | POST | Submit user report |
| `/moderation/reports` | GET | List all reports (admin) |
| `/moderation/reports/:id/action` | POST | Resolve report |

### Moderation Status

```javascript
// Moderation queue status
'pending' | 'approved' | 'rejected' | 'reviewing'

// Report resolution actions
'warn' | 'suspend' | 'ban' | 'dismiss'
```

### AI Moderation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/moderation/ai/check` | POST | Run AI moderation on text |
| `/moderation/ai/scan` | POST | Scan upload for violations |
| `/moderation/ai/status` | GET | Check AI moderation status |

```javascript
// AI moderation check
POST /moderation/ai/check
{ text: "content to check" }

// Response
{
  flagged: false,
  categories: { hate: false, violence: false, ... },
  confidence: 0.95
}
```

### AI Shadow Mode

Toggle AI moderation visibility without affecting production flow.

```javascript
// Get shadow mode status
GET /admin/moderation/shadow-mode
{ ai_shadow_mode: true }

// Toggle shadow mode
PATCH /admin/moderation/shadow-mode
{ enabled: true }
```

---

## 3. Payment Monitoring

### Financial Dashboard

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboards/admin/financial-view/:userId` | GET | User ledger + audit history |
| `/dashboards/admin/ledger/:userId` | GET | User ledger entries |
| `/dashboards/admin/chargebacks` | GET | List chargebacks |
| `/dashboards/admin/chargebacks/summary` | GET | Chargeback statistics |
| `/dashboards/admin/chargebacks/high-risk` | GET | High-risk users |
| `/dashboards/admin/anomalies` | GET | Financial anomaly alerts |

### Gift Reversal (Anti-Fraud)

```javascript
// Reverse fraudulent gift
POST /dashboards/admin/gifts/:ledgerEntryId/reverse
{ reason: "Fraud detected" }

// Response
{
  senderId: "...",
  receiverId: "...",
  amountCents: 500,
  reversed: true
}
```

### Chargeback Management

```javascript
// List chargebacks
GET /dashboards/admin/chargebacks?status=pending&limit=50

// Add admin note
POST /dashboards/admin/chargebacks/:id/note
{ note: "Contacted user" }

// High-risk users (multiple chargebacks)
GET /dashboards/admin/chargebacks/high-risk?min=2
```

---

## 4. Fraud Detection

### Fraud Alerts Dashboard

File: `packages/api/src/routes/dashboards.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboards/admin/fraud-alerts` | GET | Recent fraud events |
| `/dashboards/admin/risk/:userId` | GET | User risk score |
| `/dashboards/admin/bot-cluster/:userId` | GET | Bot farm detection |
| `/dashboards/admin/streams/:streamId/bot-check` | GET | Stream bot detection |

### Risk Score Signals

```javascript
// Risk evaluation
GET /dashboards/admin/risk/:userId

{
  userId: "...",
  score: 75,
  signals: [
    "high_likes_per_minute",
    "device_reuse",
    "rapid_interactions"
  ]
}
```

### Bot Cluster Detection

File: `packages/api/src/services/botGraphDetection.js`

```javascript
// Detect bot farm
GET /dashboards/admin/bot-cluster/:userId

{
  userId: "...",
  isBotCluster: true,
  signals: [
    "rapid_interactions",
    "same_device_cluster",
    "same_ip_cluster"
  ],
  rapidCount: 150,
  deviceClusterSize: 12,
  ipClusterSize: 8,
  sameDayCount: 25,
  inClusterRatio: 0.72
}
```

### Detection Signals

| Signal | Description |
|--------|-------------|
| `rapid_interactions` | 50+ interactions with <5s gaps |
| `same_device_cluster` | 3+ users share device fingerprint |
| `same_ip_cluster` | 3+ users share IP address |
| `same_day_signups` | 3+ accounts created same day |
| `mutual_in_cluster` | High in-cluster interaction ratio |

---

## 5. Security Dashboard

### Security Overview

File: `packages/api/src/services/securityDashboardService.js`

```javascript
GET /dashboards/admin/security/dashboard

{
  suspiciousAccounts: [
    { userId: "...", lastEventAt: "...", action: "review" }
  ],
  botClusters: [
    { fingerprint: "...", userCount: 5, deviceCount: 12 }
  ],
  deviceFingerprints: {
    totalFingerprints: 15000,
    fingerprintsSharedByMultipleUsers: 230
  },
  riskScores: [
    { userId: "...", score: 85, signals: [...] }
  ],
  trustScores: [
    { userId: "...", score: 45, riskLevel: "high", factors: {...} }
  ],
  liveAlerts: [
    { id: "...", eventType: "viewer_spike", action: "review", createdAt: "..." }
  ],
  aiAnomalyScores: [...],  // When AI enabled
  aiAnomalyShadowMode: true
}
```

### Components

| Component | Data Source | Purpose |
|-----------|-------------|---------|
| Suspicious Accounts | FraudEvent | Users flagged for review/block |
| Bot Clusters | DeviceFingerprint | Multi-user fingerprints |
| Device Summary | DeviceFingerprint | Fingerprint statistics |
| Risk Scores | riskEngine | Per-user bot risk |
| Trust Scores | trustScoreEngine | Account trust level |
| Live Alerts | FraudEvent | Real-time fraud events |

---

## 6. Content Authenticity Scoring

### Authenticity Panel

File: `packages/api/src/services/contentAuthenticityService.js`

```javascript
GET /dashboards/admin/moderation/content-authenticity

{
  authenticityScore: {
    lowScoreContent: [
      {
        contentId: "...",
        authenticityScore: 25,
        metrics: {
          uniqueViewers: 100,
          totalViews: 500,
          deviceDiversity: 20,
          suspiciousVelocity: 85
        }
      }
    ],
    count: 15
  },
  suspiciousSignals: [...],
  deviceClusters: [...]
}
```

### Score Bands

| Score Range | Band | Impact |
|-------------|------|--------|
| 80–100 | `highly_organic` | Full visibility |
| 60–79 | `normal` | Normal distribution |
| 40–59 | `suspicious` | Reduced reach |
| 20–39 | `likely_manipulation` | Trending ineligible |
| 0–19 | `confirmed_manipulation` | Monetization blocked |

### Scoring Factors

| Factor | Weight | Description |
|--------|--------|-------------|
| viewerDiversity | 20% | Unique vs total viewers |
| watchQuality | 15% | Completion rate + watch time |
| engagementDiversity | 25% | Unique engagers vs total |
| deviceDiversity | 10% | Unique devices per engager |
| geoDiversity | 5% | Geographic spread |
| temporalScore | 15% | Engagement timing variance |
| accountQuality | 10% | Average engager trust score |

---

## 7. DSAR Requests (Privacy Compliance)

### GDPR/CCPA/LGPD/PIPEDA

File: `packages/api/src/routes/compliance.js`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dsar/request` | POST | Submit DSAR request |
| `/dsar/export` | GET | Export user data |
| `/dsar/delete` | POST | Request account deletion |

### Request Types

```javascript
POST /dsar/request
{
  type: 'export' | 'delete' | 'rectification' | 'restriction',
  lawBasis: 'gdpr' | 'ccpa' | 'lgpd' | 'pipeda'
}
```

### DSAR Schema

```javascript
{
  userId: ObjectId,
  type: 'export' | 'delete' | 'rectification' | 'restriction',
  status: 'pending' | 'processing' | 'completed' | 'rejected',
  lawBasis: 'gdpr' | 'ccpa' | 'lgpd' | 'pipeda',
  requestedAt: Date,
  completedAt: Date,
  exportUrl: String,
  deletionScheduledAt: Date,
}
```

---

## 8. Trust Graph Viewer

### Neo4j Integration

File: `packages/api/src/workers/trustGraphWorker.js`

Tracks relationships for fraud detection:

```cypher
// User → Device relationship
MERGE (u:User {id: $userId})
MERGE (d:Device {id: $device})
MERGE (u)-[:USES_DEVICE]->(d)

// User → User gift relationship
MERGE (a:User {id: $sender})
MERGE (b:User {id: $receiver})
MERGE (a)-[:GIFTED]->(b)
```

### Graph Queries

| Relationship | Description |
|--------------|-------------|
| `USES_DEVICE` | User logged in from device |
| `GIFTED` | User sent gift to another |
| `FOLLOWS` | User follows another |
| `LIKED` | User liked content |

---

## 9. Platform Analytics

### Metrics Dashboard

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analytics/metrics` | GET | Current DAU, MAU, ARPU, etc. |
| `/analytics/metrics/history` | GET | Historical metrics |
| `/analytics/device-breakdown` | GET | DAU by device type |

### Key Metrics

| Metric | Description |
|--------|-------------|
| DAU | Daily Active Users |
| MAU | Monthly Active Users |
| ARPU | Average Revenue Per User |
| Creator Revenue | Sum of creator earnings |
| Retention | Week-over-week retention % |
| Conversion | Signup to purchase % |

---

## 10. Admin Tools

### Kill Switch

Emergency feature toggles:

```javascript
POST /dashboards/admin/kill-switch
{
  which: 'live_streaming' | 'payments' | 'gifts' | 'ads',
  enabled: false
}
```

### Economy Controls

```javascript
POST /dashboards/admin/economy
{
  action: 'freeze_payouts' | 'unfreeze_payouts' | 'adjust_rates',
  payload: { ... }
}
```

### Branding Settings

```javascript
// Platform branding keys
const BRANDING_KEYS = [
  'logoUrl',
  'appName', 
  'appUrl',
  'accentColor',
  'supportEmail'
];

// Get branding
GET /dashboards/admin/branding

// Update branding
POST /dashboards/admin/branding
{ logoUrl: "https://...", appName: "Millo" }
```

---

## 11. Admin Web UI

### Structure

File: `packages/web/src/pages/AdminPage.jsx`

```
/admin
  ├── Dashboard       (Overview stats)
  ├── Users           (CRUD, search, suspend)
  ├── Moderation      (Queue, reports, AI status)
  ├── Payments        (Ledger, chargebacks, payouts)
  ├── Security        (Fraud alerts, bot detection)
  ├── Analytics       (Metrics, charts)
  ├── Branding        (Logo, colors, email)
  ├── Platform Tools  (Kill switch, economy)
  └── DSAR            (Privacy requests)
```

### Access Control

```javascript
// RBAC enforcement
async function requireAdmin(request, reply) {
  const user = await authUser(request);
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return null; }
  if (user.role !== 'admin') { reply.status(403).send({ error: 'FORBIDDEN' }); return null; }
  return user;
}
```

### Audit Logging

All admin actions logged:

```javascript
await writeAdminAuditLog({
  adminId: user._id,
  action: 'admin_user_patch',
  targetType: 'User',
  targetId: req.params.id,
  meta: { patch },
});
```

---

## 12. Moderation Dashboard Panels

### Content Authenticity Panel

```javascript
GET /dashboards/admin/moderation/content-authenticity

{
  authenticityScore: {
    lowScoreContent: [...],
    count: 15
  },
  suspiciousSignals: [
    { refId: "...", signals: ["velocity_spike"], action: "review" }
  ],
  deviceClusters: [
    { contentId: "...", signals: ["device_cluster"] }
  ]
}
```

### Trend Monitoring Panel

```javascript
GET /dashboards/admin/moderation/trend-monitoring

{
  trendingHashtags: [
    { hashtag: "#viral", usageCount: 5000, uniqueCreators: 200 }
  ],
  suspiciousHashtagSpikes: [
    { tag: "#giveaway", signals: ["hashtag_burst"], action: "review" }
  ],
  creatorClusters: [
    { tag: "#promo", signals: ["creator_cluster", "low_creator_diversity"] }
  ]
}
```

---

## Summary

### API Endpoints by Category

| Category | Endpoints |
|----------|-----------|
| User Management | `/admin/users/*` |
| Content Moderation | `/moderation/*` |
| Payments | `/dashboards/admin/chargebacks/*`, `/dashboards/admin/ledger/*` |
| Fraud Detection | `/dashboards/admin/risk/*`, `/dashboards/admin/bot-cluster/*` |
| Security | `/dashboards/admin/security/*` |
| Analytics | `/analytics/*` |
| DSAR | `/dsar/*`, `/compliance/*` |
| Platform | `/dashboards/admin/kill-switch`, `/dashboards/admin/economy` |

### Key Features

| Feature | Implementation |
|---------|----------------|
| User Moderation | Full CRUD, status management, RBAC |
| Content Review | AI + human moderation queue |
| Payment Monitoring | Ledger view, chargeback tracking |
| Fraud Alerts | Real-time event stream |
| Content Authenticity | 0–100 scoring, trending eligibility |
| Bot Detection | Graph analysis, device clusters |
| Trust Graph | Neo4j relationship tracking |
| DSAR | GDPR/CCPA/LGPD/PIPEDA compliance |
| AI Shadow Mode | Test AI without production impact |
