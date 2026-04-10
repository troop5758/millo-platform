# PRODUCTION READINESS PLAN

## Purpose

This document turns the current platform gap picture into concrete launch work.  
It does **not** assert that the repository currently passes CI, tests, or production verification.

---

## Severity bands

### Launch blockers

Unsafe or misleading for public launch if unresolved.

### Must-have before public launch

Should be completed before broad launch unless explicitly scoped out.

### Should-have soon after launch

Does not necessarily block launch, but materially affects reliability or support burden.

### Launch-bar dependent

Depends on what Millo promises at launch.

---

## Launch blockers

### Money & commerce: live vs stub separation, locking, idempotency

**Type:** configure existing system; harden existing code

**Why it matters:**

- Money systems cannot appear live while running stub/provider-off behavior.
- Race conditions on payout/settlement/reassignment create real user harm.

**Repo paths:** `packages/api`, `packages/web`, `docs`

**Implementation steps:**

- make provider mode explicit in all money-critical API responses used by web
- keep stub-mode banners/labels in web money surfaces
- audit payout, settlement, reassignment, and other ledger-sensitive paths
- extend Redis lock + idempotency strategy beyond coin-confirm where needed
- finish seller verification / penalties / reassignment paths to the launch SLA

**Acceptance criteria:**

- no production money surface can silently operate in stub mode
- critical race-sensitive money paths have reviewed locking/idempotency coverage
- seller and commerce enforcement flows are no longer “partial on paper”

**Owner suggestion:** api, web, ops, product

---

### Auth: configured providers and consistent degraded handling

**Type:** configure existing system; harden existing code

**Why it matters:** Public auth should fail clearly, not ambiguously.

**Repo paths:** `packages/api`, `packages/web`

**Implementation steps:**

- configure launch auth providers
- standardize provider-not-configured handling in API
- standardize web UX for disabled/unconfigured providers
- verify no auth entry point falls into vague redirect-only behavior

**Acceptance criteria:**

- all shipped auth providers are fully configured in production
- unconfigured providers fail explicitly and consistently

**Owner suggestion:** api, web, ops

---

### Trust & safety: live/stub mode clarity

**Type:** configure existing system; document/operationalize

**Why it matters:** You cannot imply live KYC/AI/Cloudflare enforcement if providers are off.

**Repo paths:** `packages/api`, `packages/web`, `docs`

**Implementation steps:**

- decide which safety providers are truly live at launch
- expose provider mode in operator/admin surfaces
- make stub/live mode explicit in user-facing flows where relevant
- remove or downgrade claims that imply stronger enforcement than exists

**Acceptance criteria:**

- each safety surface is clearly categorized as live, stub, disabled, or deferred
- no UI or doc implies enforcement that is not actually active

**Owner suggestion:** api, web, product, ops

---

### Notifications: production email and honest push scope

**Type:** configure existing system; harden existing code

**Why it matters:** Customer communications cannot rely on console email in production.

**Repo paths:** `packages/api`, `packages/web`, `packages/mobile`

**Implementation steps:**

- configure real email delivery
- confirm which push flows are truly in launch scope
- expose delivery/provider readiness to operators
- remove user-facing promises for push flows that are not ready

**Acceptance criteria:**

- customer emails go through a real provider
- promised push flows are operational end-to-end or explicitly out of scope

**Owner suggestion:** api, mobile, web, ops

---

### Support & orders: one clear model story

**Type:** harden existing code; document/operationalize

**Why it matters:** Order-linked support needs one unambiguous workflow.

**Repo paths:** `packages/api`, `packages/web`, `docs`

**Implementation steps:**

- map Ticket vs SupportTicket usage
- define which model owns order-linked support
- align required fields and UI flows
- update docs to match actual ownership

**Acceptance criteria:**

- order-linked support is no longer split/ambiguous
- controllers, docs, and web flows follow one clear model story

**Owner suggestion:** api, web, product

---

## Must-have before public launch

### Observability: minimum viable operational story

**Type:** build missing capability; document/operationalize

**Why it matters:** On-call needs enough visibility to triage incidents quickly.

**Repo paths:** `packages/api`, `packages/web`, `docs`

**Implementation steps:**

- expose worker/queue/provider summaries
- keep ops/admin pages honest and useful
- document the minimum on-call path for provider failures, queue failures, and delivery failures

**Acceptance criteria:**

- operators can answer basic “what is failing?” questions quickly
- the platform has a defined incident-triage path even without ELK/Loki in-repo

**Owner suggestion:** api, web, ops

---

### API/UI contract honesty

**Type:** harden existing code

**Why it matters:** The web app should not promise backend capabilities that do not exist.

**Repo paths:** `packages/api`, `packages/web`

**Implementation steps:**

- ensure provider mode/config state is available in JSON where UI depends on it
- keep discovery UI honest about best-effort paging and incomplete hydration
- keep read-only admin surfaces visibly read-only

**Acceptance criteria:**

- web state matches backend truth on provider mode and product capability
- no major UX implies stable infinite feed or persisted AI controls when those are not real

**Owner suggestion:** api, web

---

### Live route and product hardening

**Type:** harden existing code

**Why it matters:** Existing live APIs/routes need one clear production story.

**Repo paths:** `packages/api`, `packages/web`

**Implementation steps:**

- harden metadata route validation/ownership (`PUT /streams/:id/metadata`, `PATCH /live/stream/:streamId`)
- document route ownership between PUT and PATCH metadata paths
- either scope down or complete filters/co-host/device analytics for launch

**Acceptance criteria:**

- one clear live metadata story exists
- unsupported live features are either completed or clearly out of launch scope

**Owner suggestion:** api, web, product

---

### Admin / AI controls

**Type:** harden existing code; build missing capability

**Why it matters:** Admin controls should either persist and matter, or clearly remain read-only.

**Repo paths:** `packages/api`, `packages/web`, `docs`

**Implementation steps:**

- keep AI controls read-only until real persistence exists
- align shadow mode vs kill-switch terminology with actual behavior
- do not present non-persistent admin controls as live configuration

**Acceptance criteria:**

- admin AI controls are either truly persisted or clearly read-only
- terminology matches behavior

**Owner suggestion:** api, web, product

---

## Should-have soon after launch

### Discovery depth

**Type:** build missing capability

**Why it matters:** Discovery quality and trust improve when hydration and CRUD coverage are complete.

**Repo paths:** `packages/api`, `packages/web`

**Implementation steps:**

- complete subscription tier CRUD
- improve row hydration coverage
- advance from best-effort paging only when backend state supports it
- clarify filter version pinning end-to-end

**Acceptance criteria:**

- discovery gaps are narrowed without fake infinite-feed claims

**Owner suggestion:** api, web, product

---

### Mobile parity

**Type:** build missing capability

**Why it matters:** Mobile should not promise features that remain stubbed.

**Repo paths:** `packages/mobile`, `docs`

**Implementation steps:**

- decide if mobile is in launch scope
- defer or complete live filters / Milla / AI areas accordingly
- remove launch promises for deferred mobile capabilities

**Acceptance criteria:**

- mobile launch scope is explicit
- deferred capabilities are not implied as shipped

**Owner suggestion:** mobile, product

---

### Locale parity and dev-toggle cleanup

**Type:** harden existing code

**Why it matters:** Shipped strings should not fall back to raw keys, and DEV auth toggles should not be mistaken for RBAC.

**Repo paths:** `packages/web`, `packages/mobile`, `docs`

**Implementation steps:**

- ensure locale parity for shipped strings
- document that DEV toggles are not production authorization
- verify admin/staff gating relies on real roles in production

**Acceptance criteria:**

- no launch-critical strings render as raw keys
- no launch flows depend on DEV-only authorization shortcuts

**Owner suggestion:** web, mobile, api

---

## Baseline engineering hygiene

These are not proven complete by the gap docs and must be verified separately.

### Required verification areas

- build health
- automated tests
- security review
- secrets management
- backups
- disaster recovery
- rate limiting
- defined production configuration for `https://milloapp.com`

**Type:** document/operationalize; harden existing code where needed

**Acceptance criteria:**

- each area has an owner and explicit verification status
- none of these are assumed complete without evidence

**Owner suggestion:** ops, api, web, product
