# TODO — MISSING CORE

**Canonical list:** Use **[`docs/PLATFORM-GAPS.md`](PLATFORM-GAPS.md)** for the living gap inventory, **Last reviewed** date, release reconciliation with `GAPS-AND-ROUTES-INDEX.md`, and **Recently narrowed** items.

This file keeps a **short** engineering reminder only.

---

## Still missing (structural)

- Universal / generic payment lookup across **every** money record and processor ID (warehouse / full index — multi-table `GET /payments/universal` is **not** complete coverage)
- Stable infinite For You as real product behavior
- Guaranteed full feed hydration for every row
- Kafka as primary app bus
- Bundled ELK/Loki in repo
- SQL ledger as primary live persistence

*(Delivery **mode** diagnostics: `GET /system/delivery` / `GET /api/system/delivery` — see PLATFORM-GAPS → Recently narrowed.)*

---

## Implemented with caveat

### Payment reference search

- Exists; coverage depends on `PaymentReference` writes; **not** universal cross-processor lookup

### Stream metadata update

- Exists; hardening ongoing; see PLATFORM-GAPS

---

## Do not overbuild

- Do not add Kafka for a small task
- Do not bundle ELK/Loki for a small task
- Do not fake stable infinite feed behavior
- Do not present `PaymentReference` lookup as universal
