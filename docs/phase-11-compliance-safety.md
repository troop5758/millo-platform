# Phase 11 — Compliance & Safety

**Owns:** GDPR tools, DSAR export, Cookie consent, Age gating, Moderation audit retention.  
**Depends on:** Phase 2.

---

## GDPR tools

DSAR, age gating, and consent logging implement GDPR-relevant data subject rights and lawful basis (consent, legitimate interest). See SOC2/ISO mappings below.

## DSAR export

- **Package:** `@millo/compliance` — `exportUserData(userId)`.
- **Export includes:** user, profile (with dateOfBirth), sessions (no tokenHash), wallet, balanceCents, ledgerEntries, transactions, reportsAsReporter, **reportsWhereTarget**, **moderationLogsWhereSubject**, tickets, consentLogs, appeals, payoutRequests, auditLogs, financialAuditLogs, levels, trustScores, liveStreams, notifications, subscriptions, dmSessions.
- **API:** `GET /compliance/dsar` — data subject (self). `GET /compliance/dsar?userId=<id>` — admin or support only.
- Session tokens are not included (security).

## Cookie consent

- **Package:** `@millo/compliance` — `logCookieConsent(userId, granted, options)`, `COOKIE_CONSENT_PURPOSE` (`'cookies'`). Wraps `logConsent(userId, purpose, version, granted, options)`.
- **Schema:** `ConsentLog` — userId, purpose, version, granted, ip, userAgent, meta. Cookie banner choice logged with purpose `cookies`.
- **API:** `POST /compliance/consent` — body: purpose, version, granted (e.g. purpose `cookies` for cookie consent); logs for authenticated user.

## Age gating

- **Package:** `@millo/compliance` — `getAge(userId)`, `isAgeAllowed(userId, minimumAgeYears)`.
- Uses `Profile.dateOfBirth` (Phase 2 schema) when present. Default minimum age: 13 (`MINIMUM_AGE_YEARS`).
- **API:** `GET /compliance/age-check` (self) or `?userId=` for self only.

## Consent logging (general)

- **Package:** `@millo/compliance` — `logConsent(userId, purpose, version, granted, options)`, `getConsentHistory(userId)`.
- **API:** `POST /compliance/consent` — body: purpose, version, granted; logs for authenticated user.

## Moderation audit retention

- **Package:** `@millo/compliance` — `MODERATION_AUDIT_RETENTION_YEARS` (default 7; overridable via env). ModerationLog and Report data are retained per policy and included in DSAR where the user is the subject.
- **DSAR:** `reportsWhereTarget` (Report where targetId = userId), `moderationLogsWhereSubject` (ModerationLog where targetId = userId) so the data subject receives moderation-related data affecting them.

## Schemas (Phase 2)

- **ConsentLog** — userId, purpose, version, granted, ip, userAgent, meta. Indexes: userId+createdAt, purpose+createdAt.
- **Profile** — optional `dateOfBirth` (Date) for age gating.
- **Report**, **ModerationLog** — used for moderation audit retention and DSAR (reportsWhereTarget, moderationLogsWhereSubject).

## SOC2 mapping

See **docs/compliance-soc2-mapping.md** — mapping of SOC 2 Trust Services Criteria to code and behaviour (e.g. CC6.1 RBAC, CC6.6 audit, PI1.1 consent, PI1.2 DSAR).

## ISO mapping

See **docs/compliance-iso-mapping.md** — mapping of ISO/IEC 27001 controls to code and behaviour (e.g. A.5.2 roles, A.8.15 logging, A.8.10 deletion/DSAR).

## Validation

- `npm run validate:phase11` — runs DSAR unit test: export has required top-level keys (including reportsWhereTarget, moderationLogsWhereSubject) and correct shape. With MongoDB, runs real export; without, asserts contract.

## Domain

All behaviour bound to https://milloapp.com.
