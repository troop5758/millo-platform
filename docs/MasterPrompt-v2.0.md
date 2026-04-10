# Millo Platform — MasterPrompt v2.0

Canonical instruction set for Cursor and the Millo 3.0 platform. Internalize this document before any phase work.

---

## 1. Absolute System Rules (Non-Negotiable)

- Generate files **only** in the order specified.
- **Never** invent undocumented services.
- **Never** skip phases.
- **Never** merge phases.
- **Never** refactor unless explicitly told.
- **Log every** financial mutation.
- **Log every** admin override.
- Keep AI **shadow-mode** unless enabled.
- Ensure the platform runs **end-to-end**.
- Ensure **full deployability via script**.
- Bind everything to **https://milloapp.com**.
- Ensure **production-ready security** posture.

---

## 2. Phase 0 — System Priming (Mandatory)

Cursor must:

1. **Internalize entire v2.0 MasterPrompt** — This document.
2. **Confirm all dependencies** — Per `docs/dependencies.md`.
3. **Confirm infra phases exist** — Per `docs/infra-phases.md`.
4. **Confirm domain binding** — Per `config/domain-binding.env.example` and docs.

---

## 3. Domain

- **Production base URL:** `https://milloapp.com`
- All production config, redirects, CORS, and links must use this domain.

---

## 4. Audit Requirements

- **Financial mutations:** Every write that affects balance, credits, payments, or payouts must append to the financial audit log.
- **Admin overrides:** Every admin-only action that overrides normal flow must append to the admin audit log.

---

## 5. AI Behavior

- AI features are **off by default** (shadow-mode).
- Enable only when explicitly configured in environment or user settings.

---

*Version: 2.0 | Millo 3.0*
