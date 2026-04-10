# Fraud & Trust System

## 1. IP Reputation Engine

- **Service**: `services/security/ipReputation.js`
- **Providers**: Cloudflare (Radar / ip-reputation), IPQualityScore, AbuseIPDB. First non-null result is used; if multiple are configured, the **worst** (highest) score is used.
- **Score bands**:
  - **0–30**: safe
  - **30–70**: suspicious
  - **70+**: blocked
- **Env**:
  - Cloudflare: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; optional `CLOUDFLARE_IP_REPUTATION_ENABLED=true` for POST ip-reputation.
  - IPQualityScore: `IPQS_API_KEY`
  - AbuseIPDB: `ABUSEIPDB_API_KEY`
- **Exports**: `getScore(ip)`, `getBand(score)`, `isBlocked(ip)`, `BANDS`, `SCORE_SAFE_MAX`, `SCORE_SUSPICIOUS_MAX`.
- **Integration**: `ipReputationService.js` uses this engine when present and returns `riskScore`, `band`; block threshold defaults to **70** (`IP_RISK_THRESHOLD_BLOCK`).

## 2. AI Moderation Fallback (Shadow Moderation)

- When **AI moderation is disabled** (`AI_MODERATION_ENABLED` not `true` or providers not configured), the pipeline runs in **shadow moderation mode**:
  - Content (text or media) is **queued** for human review instead of being auto-blocked or auto-allowed by AI.
  - **Collection**: `ModerationQueue` — `contentId`, `contentType`, `contentUrl`, `uploaderId`, `reason`, `status` (pending | reviewing | approved | rejected), `reviewedBy`, `reviewedAt`, `reviewNote`, `meta`.
  - **APIs**:
    - **GET /moderation/queue** — admin: list queue (query: `status`, `limit`, `page`).
    - **PATCH /moderation/queue/:id** — admin: set `status` to `approved`, `rejected`, or `reviewing`; optional `reviewNote`.
  - `moderateUpload()` returns `decision: 'review'` and `queued: true` when the item was enqueued.

## 3. KYC Provider Plugins

- **Unified service**: `services/kyc/index.js`
- **Providers**: `stripe_identity`, `sumsub`, `onfido`, `persona`. Configured via `KYC_PROVIDER`.
- **Exports**: `getProvider(name)`, `listProviders()`, `getConfiguredProvider()`, `createVerificationSession()`, `processWebhook()`, `checkVerificationStatus()`, `markTaxFormSubmitted()`, `getKycStatus()`, `isKycApproved()`, `createKYCAccount()`, `PROVIDERS`, `KYC_PROVIDER`.
- **Webhook**: `POST /payments/kyc/webhook/:provider` and `POST /webhooks/kyc/:provider` accept `sumsub`, `persona`, `stripe_identity`, `onfido`. Delegates to `kycService.processWebhook()`.
- **Implementation**: `kycService.js` implements session creation and webhook handling for all four providers; `services/kyc/index.js` is the single entry point and provider list.
