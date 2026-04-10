# API TODO — MISSING CORE

**Platform-wide gap inventory:** [`docs/PLATFORM-GAPS.md`](../../docs/PLATFORM-GAPS.md) (living file; reconcile with `docs/GAPS-AND-ROUTES-INDEX.md` each release).

---

## Implemented with caveat

- Payment reference lookup exists:
  - `GET /payments/search?reference=`
  - `GET /payments/reference/:ref`
- Stream metadata update exists:
  - `PUT /streams/:id/metadata`
  - `PATCH /live/stream/:streamId`

These should not be tracked as raw missing endpoints anymore.

---

## Remaining API hardening priorities

- [ ] Audit **`PaymentReference`** coverage across payment flows
- [ ] Add/expand tests around searchable reference upserts where appropriate
- [ ] Harden validation and authorization around existing metadata endpoints
- [ ] Keep Redis lock rollout moving to other critical ledger-sensitive paths (beyond coin confirm)
- [ ] Keep provider-state reporting consistent where clients depend on it (JSON bodies vs headers vs **`GET /health`**)

---

## Still absent by design / not current runtime

- Kafka is not the primary app bus
- Mongo remains the live ledger persistence path for the main application flow
- ELK/Loki is not bundled in repo

---

## Do not do

- do not add Kafka for this task
- do not replace Mongo ledger for this task
