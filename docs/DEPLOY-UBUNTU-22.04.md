# Deploy on Ubuntu 22.04 — `https://milloapp.com`

## One-shot automated install (aaPanel-style)

For a guided installer with defaults (staging API first, PM2 on, optional TLS prompts):

```bash
sudo bash scripts/millo-full-install.sh
```

See **`docs/AUTOMATED-SERVER-INSTALL.md`** for non-interactive / HTTP-only / no-Git flows.

## Script (core engine)

From the repo (as **root** on the server):

```bash
sudo bash scripts/install-ubuntu-22.04.sh
```

**Without GitHub:** use any Git server, or copy the repo onto the machine (no Git required for that path).

If **`/opt/millo/package.json`** is missing, either:

1. **Copy the monorepo** (e.g. `rsync` / `scp` from your workstation) so the **repo root** with `package.json` is at `/opt/millo`, then:
   ```bash
   cd /opt/millo && sudo bash scripts/install-ubuntu-22.04.sh
   ```
2. **Or** set a **generic** Git remote (GitLab, Gitea, self-hosted, `file://`, etc.):
   ```bash
   export MILLO_GIT_URL="https://git.example.com/your-org/millo.git"
   export LETSENCRYPT_EMAIL="ops@milloapp.com"
   sudo -E bash scripts/install-ubuntu-22.04.sh
   ```

## Temporary administrator (aaPanel-style)

After **`npm install`**, the installer runs **`node scripts/bootstrap-initial-admin.js`** (if MongoDB is up):

- If **no** user with `role: 'admin'` exists, it creates one with a **random password**.
- **Email** default: `admin@<MILLO_DOMAIN>` (e.g. `admin@milloapp.com`).
- Credentials are **printed in the console** and, when run as **root**, saved to **`/root/.millo-install-credentials.txt`** (mode `600`).
- The password is **not** written to `.env` by default (only shown + credentials file).
- On subsequent **API** startups, `ensureInitialAdmin` does nothing if an admin already exists.

**Change the password immediately** after first login. Delete the credentials file after copying it to a safe place.

Manual run: `cd /opt/millo && npm run bootstrap:admin`

Optional env: `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` (≥8 chars; if set, password is not auto-generated).

## What it installs

- Node.js **20.x**, **build-essential**, **git**, **nginx**, **certbot** (nginx plugin), **UFW**, **gettext** (`envsubst`)
- **MongoDB 7.0** (`mongodb-org`), **Redis**
- **PM2** (global)
- `npm ci` / `npm install` + **`npm run build`** at repo root
- Static web → `/var/www/millo/web` (via `infra/deploy-web.sh` when present)
- Nginx from `infra/nginx/milloapp.com.conf.template`:
  - **`https://milloapp.com`** — static SPA
  - **`https://api.milloapp.com`** — reverse proxy to API on `127.0.0.1:3000`
- Optional TLS via **certbot** (needs DNS for `milloapp.com`, `www`, `api.milloapp.com`)

## Environment variables (script)

| Variable | Default | Meaning |
|----------|---------|---------|
| `MILLO_INSTALL_DIR` | `/opt/millo` | Repo path |
| `MILLO_GIT_URL` | (empty) | Clone if install dir has no `package.json` |
| `MILLO_GIT_BRANCH` | `main` | Git branch |
| `MILLO_DOMAIN` | `milloapp.com` | Web hostname |
| `MILLO_API_HOST` | `api.milloapp.com` | API hostname |
| `MILLO_API_PORT` | `3000` | Fastify listen port |
| `LETSENCRYPT_EMAIL` | (empty) | If unset, certbot is skipped (manual run) |
| `MILLO_SKIP_SSL` | `0` | Set `1` to skip certbot |
| `MILLO_START_PM2` | `0` | Set `1` to start PM2 after build |
| `MILLO_FORCE_PM2_START` | `0` | Set `1` to start PM2 even if Stripe/OAuth empty (use with `MILLO_NODE_ENV=staging`) |
| `MILLO_NODE_ENV` | `production` | Written to `.env`; `staging` allows API up before full prod keys |
| `MILLO_PM2_ENV` | `production` | `pm2 start … --env` target in `ecosystem.config.js` |
| `MILLO_PUBLIC_SCHEME` | `https` | With `MILLO_SKIP_SSL=1` use `http` |
| `MILLO_WS_SCHEME` | `wss` | With HTTP install use `ws` |
| `MILLO_SKIP_BOOTSTRAP_ADMIN` | `0` | Set `1` to skip temporary admin creation |

## After install

1. Edit **`/opt/millo/.env`** (or your `MILLO_INSTALL_DIR`) — see `packages/api/.env.example`, `docs/ENV-SETUP-GUIDE.md`, `docs/SETUP-PRODUCTION.md`.
2. Set **`packages/web/.env.production`** `VITE_STRIPE_KEY` to your publishable key; rebuild web:  
   `npm run build -w @millo/web`  
   then `sudo bash infra/deploy-web.sh`.
3. Start API:  
   `cd /opt/millo && pm2 start ecosystem.config.js --env production && pm2 save && pm2 startup`
4. Redeploy app updates:  
   `node scripts/deploy.js` (from repo root; see `scripts/deploy.js`).

## Workers (optional)

BullMQ workers are not started by this script. If required:

```bash
cd /opt/millo
pm2 start packages/workers/src/index.js --name millo-workers
pm2 save
```

## DNS

Point:

- `milloapp.com`, `www.milloapp.com` → server IP  
- `api.milloapp.com` → same IP (or split as your ops require)

## Troubleshooting

### `set: pipefail: invalid option name` (line 26)

1. **Use bash, not dash:** run exactly  
   `sudo bash scripts/install-ubuntu-22.04.sh`  
   not `sudo sh …`.
2. **Windows line endings (CRLF):** if you copied the repo from Windows without Git’s LF checkout, convert the script:  
   `sed -i 's/\r$//' scripts/install-ubuntu-22.04.sh`  
   or `sudo apt install -y dos2unix && dos2unix scripts/install-ubuntu-22.04.sh`, then run again with `bash`.  
   CRLF often causes **syntax error near unexpected token `||`** (a trailing `\` no longer continues the line, so `||` is parsed alone).

## Related

- `ecosystem.config.js` — PM2
- `docs/PRODUCTION-CHECKLIST.md`
- `docs/WINDOWS-WORKSPACE-INSTALL.md` (dev machines only)
