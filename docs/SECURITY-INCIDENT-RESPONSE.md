# Security incident response

Security-specific incidents (confidentiality, integrity, fraud, account abuse) **in addition to** the general playbook in **`docs/RUNBOOK-ONCALL-MINIMUM.md` § 7**.  
**Every admin action** taken during containment must be **logged to audit** where the platform records overrides (Millo system rules).  
https://milloapp.com

---

## Examples (non-exhaustive)

| Type | Indicators (examples) |
|------|-------------------------|
| **Data breach** | Unauthorized export of DB/backups, misconfigured bucket, leaked `.env`, suspicious bulk reads |
| **Fraud attack** | Spike in blocked payments, gift velocity alerts, coordinated chargebacks, device-farm signals |
| **Account takeover (ATO)** | Mass password resets, new devices on high-value accounts, session anomalies, support reports |

---

## Immediate priorities

1. **Protect users and money** — fail closed on ambiguous trust (align with platform rules).
2. **Preserve evidence** — snapshots of logs, access logs, audit entries, webhook IDs **before** destructive changes where possible.
3. **Minimize scope** — contain the smallest blast radius (one integration, one cohort, one route) before broad shutdowns.

---

## Actions (playbook)

### 1. Disable affected systems

- **Product / feature** — Use **`POST /dashboards/admin/kill-switch`** (admin auth) for supported surfaces; confirm with **`GET /security/kill-switches`**. Document **which** switch and **why** in the incident ticket.
- **Infrastructure** — Remove or isolate compromised components (WAF rules, revoke service account, firewall, take deployment out of LB). Prefer **documented** runbooks (`docs/RUNBOOKS-BY-SYSTEM.md`) over ad hoc changes.

### 2. Lock accounts

- **User accounts** — Admin suspend: **`POST /dashboards/admin/users/:id/suspend`** (see `packages/api/src/routes/dashboards.js`); reverses with **`…/unsuspend`** when safe. Ensure **audit** records the actor and reason metadata your process requires.
- **Creators / commerce** — If storefront abuse: **`POST /dashboards/admin/store/suspend`** (and related store safety routes) when applicable.
- **Sessions** — If ATO is confirmed: force password reset / invalidate sessions per your **auth provider** and **token** strategy (rotate signing secrets only with a **session invalidation plan** to avoid locking out legitimate users unnecessarily).

### 3. Rotate keys

- **External** — Stripe (`STRIPE_SECRET_KEY`, webhook signing secret), OAuth client secrets, email/SMS, cloud provider keys, database passwords: rotate in **provider console** + deployment secrets; redeploy in **controlled** order (often: add new secret → dual-verify → revoke old).
- **Internal** — JWT/session signing keys, API keys between services: same pattern; verify **no hardcoded** secrets remain in repos after rotation.
- **Never** commit rotated values; use secret manager / CI injection.

### 4. Notify stakeholders

- **Internal** — Security lead, on-call, legal/privacy (especially if personal data at risk), executive comms per your policy.
- **External** — Regulators / users / partners only per **legal counsel** and breach-notification rules (jurisdiction-specific). Coordinate wording; avoid speculative blame in public channels.
- **Document** who was notified and when in the postmortem (`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`).

---

## After containment

- Open / complete **postmortem** with security root cause and **corrective** + **preventive** actions.
- Add or tune **detection** (alerts, fraud rules, WAF, anomaly detection) and **runbook** updates.
- Related: **`docs/security-checklist.md`**, **`docs/security-layer.md`**, compliance docs as applicable.
