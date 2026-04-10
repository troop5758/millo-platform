# Dependencies — Phase 0 + Phase 1 Confirmation

Dependencies are confirmed per stack and phase. No undocumented services.

## Confirmation status (Phase 1)

| Area | Status | Notes |
|------|--------|--------|
| Runtime | Node 18+ | `.nvmrc`, engines in package.json |
| Package manager | npm | Workspaces in root `package.json` |
| API | Fastify | `packages/api` |
| Web | React 18 | `packages/web` (Vite) |
| Mobile | Swift (iOS), Kotlin (Android) | `packages/mobile/ios`, `packages/mobile/android` |
| Database | MongoDB, PostgreSQL (ledger) | `packages/database` |
| Cache / queues | Redis, BullMQ | `packages/workers` |
| Infra | NGINX, PM2 | `infra/nginx.conf.example`, `infra/ecosystem.config.cjs` |
| External APIs | None | Only add when documented |

## Rule

- **Confirm all dependencies** before starting implementation phases.
- Add only dependencies that are listed in this doc or in an approved phase spec.
- Never introduce undocumented services or packages.

## Lock file

Maintain `package-lock.json` at repo root; keep under version control.

---

*Phase 1 — Stack confirmed: Node 18+, Fastify, React 18, Swift, Kotlin, MongoDB, PostgreSQL (ledger), Redis, BullMQ, NGINX, PM2.*
