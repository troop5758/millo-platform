# API PRODUCTION TODO

API-specific implementation tasks only. Does not assert CI/tests are green.

## Launch blockers

### Money & commerce

- [ ] verify live provider configuration for launch payment scope
- [ ] expose provider mode/config state in JSON where web depends on it
- [ ] audit payout/settlement/reassignment race-sensitive paths
- [ ] extend locking/idempotency strategy beyond current narrow coverage (e.g. coin confirm) where needed
- [ ] complete seller verification / penalties / reassignment behavior to launch SLA

### Auth

- [ ] standardize provider-not-configured responses
- [ ] verify production OAuth provider configuration
- [ ] remove ambiguous degraded auth behavior

### Trust & safety

- [ ] define launch mode for KYC
- [ ] define launch mode for AI moderation
- [ ] define launch mode for Cloudflare reputation
- [ ] expose those modes consistently to admin/ops clients

### Notifications

- [ ] verify real email provider configuration
- [ ] document/verify push provider readiness for promised flows

### Support & orders

- [ ] map Ticket vs SupportTicket controller ownership
- [ ] define order-linked support model ownership
- [ ] align required order-related fields and controller expectations

## Must-have before public launch

### Observability

- [ ] expose worker health summaries
- [ ] expose queue summaries
- [ ] expose provider state summaries (including `GET /health` `checks.provider_states` where applicable)
- [ ] support minimum on-call triage needs

### API/UI honesty

- [ ] ensure provider mode/config state is available in response bodies where clients depend on it
- [ ] keep discovery paging semantics explicit in responses
- [ ] keep read-only/non-persistent admin surfaces explicit (status codes, fields, or docs)

### Live

- [ ] harden metadata validation on `PUT /streams/:id/metadata` and `PATCH /live/stream/:streamId`
- [ ] harden metadata ownership/authorization checks
- [ ] document the production story for existing metadata paths
- [ ] scope down or complete co-host/device analytics/filter support for launch

### Admin / AI

- [ ] keep AI controls read-only until persistence exists
- [ ] align shadow/kill-switch semantics with actual API behavior

## Should-have soon after launch

- [ ] complete remaining discovery CRUD gaps (e.g. subscription tier CRUD)
- [ ] improve feed hydration support
- [ ] clarify filter version pinning end-to-end

## Do not assume complete without verification

- [ ] build health
- [ ] test health
- [ ] rate limiting
- [ ] secrets management
- [ ] backups/DR
- [ ] security review

## Do not (for this track)

- Do not add Kafka or ELK/Loki as prerequisites for launch.
