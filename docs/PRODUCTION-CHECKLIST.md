# PRODUCTION CHECKLIST

This checklist does not claim any item is already complete.

**Setup & verification:** `docs/SETUP-PRODUCTION.md`, `docs/ENV-SETUP-GUIDE.md`, `docs/PRODUCTION-VERIFICATION-STEPS.md`, `docs/PROVIDER-STATUS-MATRIX.md`  
**Gaps index:** `docs/GAPS-AND-ROUTES-INDEX.md`

## Launch blockers

- [ ] live payment/auth/email providers configured for launch promise
- [ ] no misleading stub/live UX on money or safety surfaces
- [ ] one clear order-linked support workflow
- [ ] discovery/feed honesty matches current paging/hydration reality
- [ ] live scope matches actual supported feature depth

## Must-have before launch

- [ ] provider mode visible where UI depends on it
- [ ] critical money paths reviewed for lock/idempotency coverage
- [ ] AI/admin surfaces do not imply persistence if read-only
- [ ] provider-not-configured auth UX is consistent
- [ ] shipped locales do not show raw keys on launch-critical paths
- [ ] worker/queue/provider visibility supports basic on-call

## Strongly recommended

- [ ] broader discovery CRUD/hydration improvements planned
- [ ] support model ambiguity reduced further
- [ ] moderation/escalation ownership documented
- [ ] mobile scope explicitly confirmed or deferred

## Not proven by this doc set

- [ ] green builds
- [ ] green tests
- [ ] security review complete
- [ ] secrets/backups/DR verified
