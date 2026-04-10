# Millo — Operational Bootstrap

Steps 1–5 to make the platform fully operational.

---

## Completed

1. **`.env` created** — Required vars for local dev (MONGODB_URI, SESSION_SECRET, JWT_SECRET, FRONTEND_URL, APP_URL, CORS_ORIGIN).
2. **`env-validate` loads `.env`** — `scripts/env-validate.js` now loads `.env` from repo root before validation.
3. **API and workers load `.env`** — Both `packages/api/src/index.js` and `packages/workers/src/index.js` load `.env` at startup.
4. **`npm run env:validate`** — Passes with required vars set.

---

## Prerequisites

### MongoDB and Redis

Start MongoDB and Redis before running the API:

**Option A — Docker (recommended):**
```bash
docker compose up mongo redis -d
```
Then set in `.env`:
```
MONGODB_URI=mongodb://millo:changeme@localhost:27017/millo?authSource=admin
```

**Option B — Local install:**
- MongoDB on `localhost:27017`, Redis on `localhost:6379`
- Use `MONGODB_URI=mongodb://localhost:27017/millo` in `.env`

### Dependencies

```bash
npm install
```
If you see `EISDIR` or symlink errors on Windows:
- Close IDEs/editors and any processes using `node_modules`
- Try: `rm -rf node_modules packages/*/node_modules` then `npm install`
- Or run from WSL/Linux, or use Docker for the full stack

---

## Steps to Run

1. **Validate env:**
   ```bash
   npm run env:validate
   ```

2. **Start API** (terminal 1):
   ```bash
   npm run start:api
   ```

3. **Start workers** (terminal 2):
   ```bash
   npm run start:workers
   ```

4. **Run production gate:**
   ```bash
   npm run production-gate
   ```

---

## Production

Before production:

- Replace `.env` secrets (SESSION_SECRET, JWT_SECRET) with cryptographically random values.
- Set `NODE_ENV=production`, `SECURE_COOKIES=true`.
- Use HTTPS for FRONTEND_URL, APP_URL, CORS_ORIGIN.
- Configure Stripe, SendGrid, S3, etc. per `scripts/env-validate.js` optional vars.
- Deploy via `node scripts/deploy.js` (Phase 18) or Kubernetes (Phase 15).
