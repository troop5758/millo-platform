# Automated server install (aaPanel-style)

One command installs OS packages (Node 20, MongoDB, Redis, Nginx, Certbot), places the app, builds, deploys static web, configures Nginx, optionally obtains TLS, starts PM2, and creates a **temporary administrator** (credentials printed + `/root/.millo-install-credentials.txt` when root).

## Script (single installer)

| File | Role |
|------|------|
| **`scripts/install-ubuntu-22.04.sh`** | **Canonical** — full flow (wizard when TTY, optional PostgreSQL & Fail2ban, CRLF strip, Nginx, TLS, PM2). |
| `scripts/millo-full-install.sh` | Wrapper — runs the canonical script. |
| `infra/install-all.sh` | Wrapper — supports `REPO_URL` + `INSTALL_DIR` clone, then runs canonical script. |
| `infra/install.sh` | Wrapper — same as canonical. |

**Run on Ubuntu 22.04 as root** from the repo root:

```bash
sudo bash scripts/install-ubuntu-22.04.sh
```

Equivalent: `sudo bash scripts/millo-full-install.sh`

Interactive prompts ask for domain, API host, install path, optional Git URL, and Let’s Encrypt email (empty = skip HTTPS and use `http` / `ws` for the Vite build).

**Install path** must be an absolute directory (e.g. `/opt/millo`). Press **Enter** there to accept the default. Typing **`y`** is treated as “yes” by mistake and ignored (default path kept).

If **`/opt/millo` has no `package.json`** but you ran the script from a **full clone** (e.g. `/root/millo/scripts/millo-full-install.sh`), the installer **asks** (interactive) whether to use that folder, or **auto-switches** (non-interactive) when `MILLO_INSTALL_DIR` is still the default `/opt/millo` — unless **`MILLO_AUTO_SOURCE_REPO=0`**.

To point at a clone explicitly:

```bash
export MILLO_INSTALL_DIR=/root/millo   # or wherever package.json lives
sudo bash scripts/millo-full-install.sh
```

## Non-interactive (cloud-init / CI)

```bash
sudo MILLO_NONINTERACTIVE=1 \
  MILLO_GIT_URL="https://git.example.com/org/millo.git" \
  LETSENCRYPT_EMAIL="ops@milloapp.com" \
  bash scripts/millo-full-install.sh
```

**No Git:** copy the full monorepo to `/opt/millo` (root must contain `package.json`), then:

```bash
sudo MILLO_NONINTERACTIVE=1 LETSENCRYPT_EMAIL="ops@milloapp.com" bash scripts/millo-full-install.sh
```

**HTTP only** (no DNS / no certbot yet):

```bash
sudo MILLO_NONINTERACTIVE=1 MILLO_SKIP_SSL=1 \
  MILLO_PUBLIC_SCHEME=http MILLO_WS_SCHEME=ws \
  bash scripts/millo-full-install.sh
```

If you later switch to HTTPS, remove `packages/web/.env.production`, re-run the web build + `infra/deploy-web.sh` (or re-run install steps) so `VITE_*` URLs update.

## Staging vs production (important)

The auto installer defaults to **`NODE_ENV=staging`** in `.env` so the API **starts without** full Stripe, OAuth, and transactional email. That matches an aaPanel-like “panel is up, configure the rest inside.”

Before **real** production traffic:

1. Edit **`/opt/millo/.env`** — real `STRIPE_*`, `OAUTH_*`, email provider, etc. (`docs/ENV-SETUP-GUIDE.md`).
2. Set **`NODE_ENV=production`**.
3. Rebuild web if API/public URLs changed: `npm run build -w @millo/web` and `sudo bash infra/deploy-web.sh`.
4. `pm2 reload ecosystem.config.js --env production` (or restart).

To install with **`NODE_ENV=production`** from the start, you must supply valid production configuration in `.env` **before** PM2 starts; the core installer normally skips PM2 until Stripe/OAuth are filled unless **`MILLO_FORCE_PM2_START=1`** (the auto script sets this for staging).

## Environment variables (auto + core)

See `docs/DEPLOY-UBUNTU-22.04.md` for the full table. Extra flags used by automation:

| Variable | Purpose |
|----------|---------|
| `MILLO_NONINTERACTIVE` | `1` — no prompts; require env for Git/TLS rules |
| `MILLO_NODE_ENV` | `staging` (default in auto) or `production` |
| `MILLO_FORCE_PM2_START` | `1` — start PM2 even if Stripe/OAuth lines are empty (use with staging) |
| `MILLO_PM2_ENV` | `production` or `staging` — passed to `pm2 start … --env` |
| `MILLO_PUBLIC_SCHEME` / `MILLO_WS_SCHEME` | `https`/`wss` or `http`/`ws` when skipping TLS |
| `MILLO_SKIP_BOOTSTRAP_ADMIN` | `1` — skip `bootstrap-initial-admin.js` |

## Related

- `docs/DEPLOY-UBUNTU-22.04.md` — manual steps, DNS, PM2, checklist  
- `npm run bootstrap:admin` — re-run admin bootstrap if Mongo was down during install  
