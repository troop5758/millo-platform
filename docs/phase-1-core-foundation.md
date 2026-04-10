# PHASE 1 — CORE FOUNDATION

Canonical structure and technology stack for the Millo platform.  
Production: https://milloapp.com

**Owns:** Monorepo structure, shared logger, feature flags, kill-switch system, auth middleware shell, RBAC primitives, environment loader, config binding.  
**Must NOT include:** Business logic, controllers, economy, live features.  
**Dependencies:** None.

---

## Phase 1 deliverables

| Deliverable | Location | Purpose |
|-------------|----------|---------|
| Shared logger | `packages/shared/src/logger.js` | `logger.info`, `logger.warn`, `logger.error`, `logger.debug`; level via `LOG_LEVEL` |
| Feature flags | `packages/shared/src/featureFlags.js` | `isEnabled(name)`, `getFlag(name)` from `FEATURE_*` env |
| Kill-switch system | `packages/shared/src/killSwitch.js` | `isEnabled(name)`, `isKilled(name)` from `KILL_SWITCH_*` env |
| RBAC primitives | `packages/shared/src/rbac.js` | `ROLES`, `hasRole(user, role)`, `requireRole(user, role)` |
| Environment loader | `packages/shared/src/envLoader.js` | `loadEnv(filePath)` loads `.env` into `process.env` |
| Config binding | `packages/shared/src/config.js` | `bind(opts)` returns `port`, `host`, `nodeEnv`, `appUrl` from env |
| Auth middleware shell | `packages/api/src/middleware/authShell.js` | `createAuthMiddleware()` — sets `request.user` (shell only; no token validation) |

Shared package exports all via `packages/shared/index.js`. API registers auth shell in `app.js` as `onRequest` hook.

---

## Monorepo structure

```
Millo 3.0/
├── packages/
│   ├── api/          # Fastify API server
│   ├── web/          # React 18 web app
│   ├── mobile/       # Swift (iOS) + Kotlin (Android)
│   ├── live/         # Live streaming
│   ├── battles/      # Battles feature
│   ├── level-trust/  # Level & trust
│   ├── economy/      # Economy + ledger
│   ├── ads/          # Ads
│   ├── dashboards/   # Admin / Mod / Support dashboards
│   ├── tv/           # TV / casting
│   ├── shared/       # Shared utilities and types
│   ├── database/     # MongoDB + PostgreSQL (ledger) access
│   └── workers/      # BullMQ background jobs
├── infra/            # NGINX, PM2, provisioning, deploy scripts
└── scripts/          # Lint, deploy, validate-*, integration tests
```

Additional packages present in the repo (beyond Phase 1 core) are used by later phases: e.g. `notifications`, `security`, `compliance`, `billing`, `discovery`, `dm-monetization`, `milla`, `ai-optimization`, `self-observation`.

---

## Technology stack

| Layer        | Technology        | Notes                          |
|-------------|-------------------|--------------------------------|
| Runtime     | **Node 20+**      | All Node packages              |
| API         | **Fastify**       | `packages/api`                 |
| Web         | **React 18**      | `packages/web` (Vite)          |
| Mobile iOS  | **Swift**         | `packages/mobile/ios/`         |
| Mobile Android | **Kotlin**     | `packages/mobile/android/`    |
| Primary DB  | **MongoDB**       | Via `packages/database`        |
| Ledger      | **PostgreSQL**    | Economy ledger                 |
| Cache/queue | **Redis**         | Sessions, BullMQ               |
| Job queue   | **BullMQ**        | `packages/workers`             |
| Reverse proxy | **NGINX**       | `infra/nginx.conf`             |
| Process mgmt | **PM2**         | `infra/pm2.config.js`          |

---

## Package roles (Phase 1 core)

- **api** — Fastify app; mounts routes from live, economy, dashboards, tv, etc.; auth, rate limit, security headers.
- **web** — React SPA; landing, live, feed, creator, shop, help, login, admin/support/mod dashboards.
- **mobile** — Native iOS (Swift) and Android (Kotlin); not an npm workspace; push, biometrics, offline.
- **live** — Live streaming logic and APIs.
- **battles** — Battles feature.
- **level-trust** — Level and trust scoring.
- **economy** — Coins, wallet, ledger (PostgreSQL); credit/debit, admin overrides.
- **ads** — Ads serving.
- **dashboards** — Admin / Mod / Support server-side logic (RBAC, audit log).
- **tv** — TV app / casting pairing and APIs.
- **shared** — Shared code (constants, helpers) used across packages.
- **database** — MongoDB connection and schemas; ledger integration.
- **workers** — BullMQ workers for async jobs.

---

## Infra and scripts

- **infra/** — Provisioning (MongoDB, PostgreSQL, Redis), NGINX config, TLS (Let’s Encrypt), PM2/ecosystem, deploy and rollout scripts.
- **scripts/** — Repo-level scripts: `lint`, `deploy`, `validate-bootstrap`, `validate-schemas`, `validate-phase*`, `integration-tests`, `load-test`, `production-gate`.

---

## Verification

- Root `package.json` enforces **Node 20+** and declares workspaces for all Node packages.
- `mobile` is not a workspace (native Swift/Kotlin).
- Run `npm run validate:bootstrap` and phase-specific validators to confirm Phase 1 foundation.
