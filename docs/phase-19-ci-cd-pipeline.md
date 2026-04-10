# Phase 19 — CI/CD

**Owns:** Pipeline YAML, Lint, Test, Docker build, SSH deploy, Rollback logic.

**Depends on:** Phase 18.

---

## Scope

- **Pipeline YAML** — `.github/workflows/ci-cd.yml`: single workflow with jobs lint, test, build, docker, deploy.
- **Lint** — `npm run lint` (scripts/lint.js); runs in pipeline.
- **Test** — Validations (bootstrap, schemas, phase3–18 as applicable; no DB-dependent phases in CI by default).
- **Docker build** — `docker build -t millo-api .`; Dockerfile multi-stage.
- **SSH deploy** — On push to main/master, deploy job can SSH to production (DEPLOY_HOST, DEPLOY_SSH_KEY) and run `git pull` + `infra/rolling-restart.sh` for zero-downtime.
- **Rollback logic** — `infra/rollback.sh`: on server, revert to previous revision and run rolling restart (e.g. `git reset --hard HEAD~1` then `infra/rolling-restart.sh`).
- **Validation:** Pipeline structure; rolling restart uses `pm2 reload`; rollback script present.

---

## Workflow (`.github/workflows/ci-cd.yml`)

| Job    | Runs on   | Steps |
|--------|-----------|--------|
| lint   | ubuntu-latest | checkout, setup-node 18, npm ci, node scripts/lint.js |
| test   | ubuntu-latest | checkout, npm ci, validate:bootstrap, validate:schemas, validate:phase3–18 (subset without MongoDB) |
| build  | ubuntu-latest (needs lint, test) | checkout, npm ci, npm run build |
| docker | ubuntu-latest (needs build) | checkout, docker build -t millo-api . |
| deploy | ubuntu-latest (needs docker, main/master only) | Rolling restart message; **SSH deploy** when DEPLOY_SSH_KEY (and DEPLOY_HOST, optional DEPLOY_USER, DEPLOY_PATH) are set — SSH to server, git pull, infra/rolling-restart.sh |

---

## Zero-downtime rolling restart

- **infra/rolling-restart.sh** — Runs `pm2 reload` and `pm2 save`. Reload restarts processes one by one so traffic is not dropped.
- On the production server after pulling new code or image, run: `bash infra/rolling-restart.sh`.

## Rollback logic

- **infra/rollback.sh** — On the server: revert to a previous Git revision (default `HEAD~1`) and run rolling restart. Usage: `sudo bash infra/rollback.sh [REVISION]` (e.g. `infra/rollback.sh HEAD~1` or a commit hash).

---

## Docker

- **Dockerfile** — Multi-stage: builder (node:18-alpine, npm ci, build), production (copy app + node_modules, CMD node packages/api/src/index.js).
- **.dockerignore** — Excludes node_modules, .git, .env, infra, docs, web, mobile.

---

## Validation

- `npm run validate:phase19` — Checks: `.github/workflows/ci-cd.yml` exists and defines jobs lint, test, build, docker, deploy; workflow includes lint, test, build, docker steps; `infra/rolling-restart.sh` exists and uses `pm2 reload`; `infra/rollback.sh` exists and contains rollback/restart logic; Dockerfile and scripts/lint.js exist.

---

## Domain

CI/CD binds to https://milloapp.com (production deploy target).
