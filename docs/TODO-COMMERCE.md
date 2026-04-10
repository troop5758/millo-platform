# TODO — COMMERCE

## Current reality

- Redis locking exists on narrow paths but not all ledger-sensitive paths
- seller verification is partial/provider-dependent
- penalties and reassignment worker coverage are partial

## Next hardening tasks

- [ ] map all ledger-sensitive write paths
- [ ] expand lock/idempotency coverage where races matter
- [ ] define seller verification launch SLA
- [ ] complete penalties/reassignment behavior needed for supportability

## Do not overclaim

- do not treat partial seller/dispute flows as fully launch-ready
