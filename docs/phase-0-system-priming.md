# Phase 0 — System Priming

**Scope:** Mental model, dependency confirmation, domain binding confirmation, phase ordering validation.  
**Must NOT generate:** Any code, any schema, any config.

---

## 1. Mental model build

- **Millo 3.0** is a live streaming and creator platform: stream, sell, shorts, gifts, coins, shopfronts, discovery, ads, billing, compliance, dashboards, and AI (MILLA) under policy and kill-switches.
- **Absolute rules:** Generate only in specified order; never invent undocumented services; never skip or merge phases; never refactor unless asked; log every financial mutation and admin override; AI shadow-mode unless enabled; production-ready security; full deployability via script; bind to https://milloapp.com.
- **Boundaries:** Only documented services and packages; no code/schema/config produced in Phase 0.

---

## 2. Dependency confirmation

Dependencies are confirmed per **docs/dependencies.md**:

| Area        | Confirmed stack / tooling |
|------------|----------------------------|
| Runtime    | Node 18+                   |
| Package mgr| npm, workspaces            |
| API        | Fastify                    |
| Web        | React 18, Vite             |
| Mobile     | Swift (iOS), Kotlin (Android) |
| Database   | MongoDB, PostgreSQL (ledger) |
| Cache/queue| Redis, BullMQ              |
| Infra      | NGINX, PM2                 |
| External   | None unless documented     |

No new dependencies are introduced in Phase 0. Confirmation only.

---

## 3. Domain binding confirmation

- **Production base URL:** https://milloapp.com  
- All production config, redirects, CORS, links, and infra bindings use this domain (and subdomains api.milloapp.com, cdn.milloapp.com where applicable).  
- Confirmed in: **docs/MasterPrompt-v2.0.md**, **.cursor/rules/millo-system-rules.mdc**, and infra/phase docs.  
- No config or code is generated in Phase 0; confirmation only.

---

## 4. Phase ordering validation

Phases exist in this order and must not be skipped or merged:

| Order | Phase | Name |
|-------|--------|------|
| 0 | Phase 0 | System Priming (this phase) |
| 1 | Phase 1 | Core Foundation |
| 2 | Phase 1.5 | Application Bootstrap |
| 3 | Phase 2 | Database Schemas |
| 4 | Phase 3 | Level & Trust Engine |
| 5 | Phase 4 | Live Streaming Core |
| 6 | Phase 5 | Live Filters SDK |
| 7 | Phase 5.5 | Virtual Streamers (MILLA) |
| 8 | Phase 5.6 | MILLA Live Integration |
| 9 | Phase 6 | Economy + Commerce |
| 10 | Phase 6.2 | DM Monetization |
| 11 | Phase 7 | Discovery Engine |
| 12 | Phase 8 | Ads Engine |
| 13 | Phase 9 | Billing & Payouts |
| 14 | Phase 10 | Dashboards (Admin / Mod / Support) |
| 15 | Phase 11 | Compliance & Safety |
| 16 | Phase 12 | Smart TV Clients (Read-Only) |
| 17 | Phase 13 | AI Optimization (Shadow Mode) |
| 18 | Phase 14 | Mobile Clients |
| 19 | Phase 15 | Emails + Branding + Notifications |
| 20 | Phase 16 | Public Web & Legal |
| 21 | Phase 17 | Self-Observation Engine |
| 22 | Phase 18 | Infrastructure (Ubuntu 22.04) |
| 23 | Phase 19 | CI/CD Pipeline |
| 24 | Phase 20 | Security Hardening |
| 25 | Final | Production Gate |

**Validation:** Phase ordering is confirmed. No phase is skipped or merged. Proceed to implementation only after Phase 0; implement in the order above.

---

**Phase 0 complete. No code, schema, or config generated.**
