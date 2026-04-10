#!/usr/bin/env bash
# =============================================================================
# Millo — unified automatic install for Ubuntu 22.04 LTS (jammy)
# Single entrypoint: system deps, Node 20, MongoDB 7, Redis, optional PostgreSQL &
# Fail2ban, Nginx (milloapp.com template), Let's Encrypt, npm ci/build, web deploy,
# optional PM2, temporary admin bootstrap.
#
# Target: https://milloapp.com  |  API: https://api.milloapp.com
#
# Usage (as root):
#   cd /path/to/millo && sudo bash scripts/install-ubuntu-22.04.sh
#
# Fully non-interactive (cloud-init / CI):
#   sudo MILLO_NONINTERACTIVE=1 \
#     MILLO_GIT_URL="https://git.example.com/org/millo.git" \
#     LETSENCRYPT_EMAIL="ops@milloapp.com" \
#     bash scripts/install-ubuntu-22.04.sh
#
# Copy-only (no git): place monorepo on server, then:
#   sudo MILLO_NONINTERACTIVE=1 LETSENCRYPT_EMAIL="ops@milloapp.com" bash scripts/install-ubuntu-22.04.sh
#
# Thin wrappers (same script): scripts/millo-full-install.sh, infra/install-all.sh
#
# Environment (optional):
#   MILLO_INSTALL_DIR=/opt/millo
#   MILLO_AUTO_SOURCE_REPO=1          # use repo containing this script if install dir empty (default 1)
#   MILLO_GIT_URL=... MILLO_GIT_BRANCH=main
#   LETSENCRYPT_EMAIL=...             # required for certbot unless MILLO_SKIP_SSL=1
#   MILLO_SKIP_SSL=1                  # skip certbot; set MILLO_PUBLIC_SCHEME=http MILLO_WS_SCHEME=ws
#   MILLO_START_PM2=1                 # default 1 — start PM2 when Stripe/OAuth present (or FORCE)
#   MILLO_FORCE_PM2_START=1           # default 1 — start even if Stripe/OAuth empty (use staging NODE_ENV)
#   MILLO_NODE_ENV=staging|production # default staging for first boot
#   MILLO_PM2_ENV=production|staging
#   MILLO_WITH_FAIL2BAN=1           # default 1 — ssh jail via infra/fail2ban.sh pattern
#   MILLO_WITH_POSTGRESQL=0         # set 1 to run infra/provision-postgresql.sh (optional SQL)
#   MILLO_NONINTERACTIVE=1          # no prompts; set GIT or pre-copy repo + email or SKIP_SSL
#   MILLO_SKIP_BOOTSTRAP_ADMIN=1
#
# https://milloapp.com
# =============================================================================
if [ -z "${BASH_VERSION:-}" ]; then
  echo "[millo-install] ERROR: Run with bash: sudo bash scripts/install-ubuntu-22.04.sh" >&2
  exit 1
fi
set -euo pipefail

export MILLO_DOMAIN="${MILLO_DOMAIN:-milloapp.com}"
export MILLO_API_HOST="${MILLO_API_HOST:-api.milloapp.com}"
MILLO_API_PORT="${MILLO_API_PORT:-3000}"
export MILLO_INSTALL_DIR="${MILLO_INSTALL_DIR:-/opt/millo}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
MILLO_SKIP_SSL="${MILLO_SKIP_SSL:-0}"
# Fully automatic first boot: PM2 on, force start OK with staging NODE_ENV
export MILLO_START_PM2="${MILLO_START_PM2:-1}"
export MILLO_FORCE_PM2_START="${MILLO_FORCE_PM2_START:-1}"
MILLO_GIT_URL="${MILLO_GIT_URL:-}"
export MILLO_GIT_BRANCH="${MILLO_GIT_BRANCH:-main}"
export MILLO_NODE_ENV="${MILLO_NODE_ENV:-staging}"
export MILLO_PUBLIC_SCHEME="${MILLO_PUBLIC_SCHEME:-https}"
export MILLO_WS_SCHEME="${MILLO_WS_SCHEME:-wss}"
export MILLO_PM2_ENV="${MILLO_PM2_ENV:-production}"
MILLO_SKIP_BOOTSTRAP_ADMIN="${MILLO_SKIP_BOOTSTRAP_ADMIN:-0}"
MILLO_WITH_FAIL2BAN="${MILLO_WITH_FAIL2BAN:-1}"
MILLO_WITH_POSTGRESQL="${MILLO_WITH_POSTGRESQL:-0}"

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; CYN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GRN}[millo-install]${NC} $*"; }
warn()  { echo -e "${YEL}[millo-install]${NC} $*"; }
die()   { echo -e "${RED}[millo-install] ERROR:${NC} $*"; exit 1; }

if [[ "${EUID:-0}" -ne 0 ]]; then
  die "Run as root: sudo bash $0"
fi

if ! grep -q 'jammy' /etc/os-release 2>/dev/null; then
  warn "Expected Ubuntu 22.04 (jammy). Continuing anyway."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_install_dir() {
  local raw="${1:-}"
  local def="${2:-/opt/millo}"
  local t
  t="$(printf '%s' "$raw" | tr '[:upper:]' '[:lower:]')"
  [[ -z "$raw" ]] && { printf '%s' "$def"; return; }
  if [[ "$t" == "y" || "$t" == "n" || "$t" == "yes" || "$t" == "no" ]]; then
    warn "Ignoring '${raw}' as path (yes/no). Using ${def}"
    printf '%s' "$def"
    return
  fi
  if [[ "${raw:0:1}" != "/" ]]; then
    die "Install path must be absolute (e.g. /opt/millo). Got: ${raw}"
  fi
  printf '%s' "$raw"
}

validate_millo_install_dir() {
  local d="${MILLO_INSTALL_DIR:-}"
  [[ -n "$d" ]] || die "MILLO_INSTALL_DIR is empty."
  if [[ "${#d}" -eq 1 ]] && [[ "$d" =~ ^[yYnN]$ ]]; then
    die "MILLO_INSTALL_DIR invalid ('${d}'). Use full path e.g. /opt/millo"
  fi
  [[ "${d:0:1}" == "/" ]] || die "MILLO_INSTALL_DIR must be absolute. Got: ${d}"
}

ensure_millo_sources() {
  if [[ -f "${MILLO_INSTALL_DIR}/package.json" ]] || [[ -n "${MILLO_GIT_URL:-}" ]]; then
    return 0
  fi
  if [[ -f "${SCRIPT_REPO_ROOT}/package.json" ]]; then
    if [[ "${MILLO_AUTO_SOURCE_REPO:-1}" == "1" ]]; then
      export MILLO_INSTALL_DIR="${SCRIPT_REPO_ROOT}"
      info "Using monorepo at ${MILLO_INSTALL_DIR} (MILLO_AUTO_SOURCE_REPO=1)."
      return 0
    fi
    if [[ -t 0 ]] && [[ "${MILLO_NONINTERACTIVE:-}" != "1" ]]; then
      warn "No package.json under ${MILLO_INSTALL_DIR:-/opt/millo}."
      read -r -p "Use this folder instead? ${SCRIPT_REPO_ROOT} [Y/n]: " _ans
      _a="$(printf '%s' "${_ans:-}" | tr '[:upper:]' '[:lower:]')"
      if [[ -z "${_ans:-}" || "$_a" == "y" || "$_a" == "yes" ]]; then
        export MILLO_INSTALL_DIR="${SCRIPT_REPO_ROOT}"
        return 0
      fi
      read -r -p "Git URL to clone into ${MILLO_INSTALL_DIR}: " _gu
      [[ -n "${_gu:-}" ]] || die "Need Git URL or local monorepo path."
      export MILLO_GIT_URL="$_gu"
      return 0
    fi
  fi
  die "No app at ${MILLO_INSTALL_DIR} (no package.json). Set MILLO_GIT_URL, copy the repo, or run from inside the monorepo."
}

# --- Interactive wizard -------------------------------------------------------
if [[ -t 0 ]] && [[ "${MILLO_NONINTERACTIVE:-}" != "1" ]]; then
  echo ""
  echo -e "${CYN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYN}║  Millo — Ubuntu 22.04 automatic install                       ║${NC}"
  echo -e "${CYN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  read -r -p "Web domain [${MILLO_DOMAIN}]: " _d
  [[ -n "${_d:-}" ]] && export MILLO_DOMAIN="$_d"
  read -r -p "API hostname [${MILLO_API_HOST}]: " _a
  [[ -n "${_a:-}" ]] && export MILLO_API_HOST="$_a"
  echo "Install path (absolute, e.g. /opt/millo). Enter = default."
  read -r -p "Path [${MILLO_INSTALL_DIR}]: " _p
  export MILLO_INSTALL_DIR="$(resolve_install_dir "${_p:-}" "${MILLO_INSTALL_DIR}")"
  read -r -p "Git URL (empty if repo already at path): " _g
  [[ -n "${_g:-}" ]] && export MILLO_GIT_URL="$_g"
  read -r -p "Git branch [${MILLO_GIT_BRANCH}]: " _b
  [[ -n "${_b:-}" ]] && export MILLO_GIT_BRANCH="$_b"
  echo "Let's Encrypt email (empty = skip HTTPS for now):"
  read -r -p "ACME email: " _e
  if [[ -n "${_e:-}" ]]; then
    export LETSENCRYPT_EMAIL="$_e"
    export MILLO_SKIP_SSL=0
  else
    export MILLO_SKIP_SSL=1
    export MILLO_PUBLIC_SCHEME="${MILLO_PUBLIC_SCHEME:-http}"
    export MILLO_WS_SCHEME="${MILLO_WS_SCHEME:-ws}"
    warn "TLS skipped — using ${MILLO_PUBLIC_SCHEME}/${MILLO_WS_SCHEME}."
  fi
  read -r -p "Install optional PostgreSQL (millo_ledger)? [y/N]: " _pg
  if [[ "$(printf '%s' "${_pg:-}" | tr '[:upper:]' '[:lower:]')" == "y" ]]; then
    export MILLO_WITH_POSTGRESQL=1
  fi
  echo ""
  info "Starting install…"
fi

if [[ "${MILLO_SKIP_SSL:-0}" == "1" ]] && [[ -z "${MILLO_PUBLIC_SCHEME:-}" || "${MILLO_PUBLIC_SCHEME}" == "https" ]]; then
  export MILLO_PUBLIC_SCHEME=http
  export MILLO_WS_SCHEME="${MILLO_WS_SCHEME:-ws}"
fi

validate_millo_install_dir
ensure_millo_sources
validate_millo_install_dir

if [[ "${MILLO_NONINTERACTIVE:-}" == "1" ]]; then
  if [[ ! -f "${MILLO_INSTALL_DIR}/package.json" ]] && [[ -z "${MILLO_GIT_URL:-}" ]]; then
    die "MILLO_NONINTERACTIVE: set MILLO_GIT_URL or copy repo to ${MILLO_INSTALL_DIR}."
  fi
  if [[ -z "${LETSENCRYPT_EMAIL:-}" ]] && [[ "${MILLO_SKIP_SSL:-0}" != "1" ]]; then
    die "Set LETSENCRYPT_EMAIL or MILLO_SKIP_SSL=1."
  fi
fi

strip_script_crlf() {
  local root="${1:-}"
  [[ -d "$root/scripts" ]] || return 0
  local f
  shopt -s nullglob
  for f in "$root/scripts"/*.sh "$root/infra"/*.sh; do
    [[ -f "$f" ]] && sed -i 's/\r$//' "$f" 2>/dev/null || true
  done
  shopt -u nullglob
}

# --- 1) Base packages --------------------------------------------------------
info "Installing base packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates curl gnupg lsb-release git ufw nginx \
  certbot python3-certbot-nginx \
  redis-server \
  build-essential gettext-base

# --- 2) Node.js 20.x ----------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  info "Installing Node.js 20.x…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
info "Node: $(node -v)  npm: $(npm -v)"

# --- 3) MongoDB 7.0 -----------------------------------------------------------
if ! command -v mongod >/dev/null 2>&1; then
  info "Installing MongoDB 7.0…"
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -y
  apt-get install -y mongodb-org
  systemctl enable mongod
  systemctl start mongod
else
  systemctl start mongod 2>/dev/null || true
fi

systemctl enable redis-server
systemctl restart redis-server

# --- 4) PM2 -------------------------------------------------------------------
if ! command -v pm2 >/dev/null 2>&1; then
  info "Installing PM2…"
  npm install -g pm2
fi

# --- 5) Firewall --------------------------------------------------------------
info "Configuring UFW…"
ufw allow OpenSSH
ufw allow 'Nginx Full' || true
ufw --force enable || true

if [[ "$MILLO_WITH_FAIL2BAN" == "1" ]]; then
  info "Installing Fail2ban (sshd)…"
  apt-get install -y fail2ban
  cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
EOF
  systemctl enable fail2ban
  systemctl restart fail2ban || true
fi

# --- 6) App tree --------------------------------------------------------------
mkdir -p "$MILLO_INSTALL_DIR"
mkdir -p /var/www/millo/web /var/www/millo/cdn

if [[ ! -f "$MILLO_INSTALL_DIR/package.json" ]]; then
  if [[ -n "$MILLO_GIT_URL" ]]; then
    info "Cloning → $MILLO_INSTALL_DIR …"
    git clone --branch "$MILLO_GIT_BRANCH" --depth 1 "$MILLO_GIT_URL" "$MILLO_INSTALL_DIR"
  else
    die "No package.json at $MILLO_INSTALL_DIR. Clone (MILLO_GIT_URL) or copy monorepo."
  fi
fi

cd "$MILLO_INSTALL_DIR"
REPO_ROOT="$(pwd)"
strip_script_crlf "$REPO_ROOT"

if [[ "$MILLO_WITH_POSTGRESQL" == "1" ]] && [[ -x "$REPO_ROOT/infra/provision-postgresql.sh" ]]; then
  info "Optional PostgreSQL (millo_ledger)…"
  bash "$REPO_ROOT/infra/provision-postgresql.sh"
fi

# --- 7) .env ------------------------------------------------------------------
ENV_FILE="$REPO_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  info "Creating $ENV_FILE skeleton…"
  JWT_SEC="$(openssl rand -base64 48 | tr -d '\n')"
  SESS_SEC="$(openssl rand -base64 48 | tr -d '\n')"
  cat > "$ENV_FILE" << EOF
# Generated by install-ubuntu-22.04.sh — edit before production traffic
NODE_ENV=${MILLO_NODE_ENV}
PORT=${MILLO_API_PORT}

MONGODB_URI=mongodb://127.0.0.1:27017/millo
REDIS_URL=redis://127.0.0.1:6379

JWT_SECRET=${JWT_SEC}
SESSION_SECRET=${SESS_SEC}

MILLO_DOMAIN=${MILLO_DOMAIN}
FRONTEND_URL=${MILLO_PUBLIC_SCHEME}://${MILLO_DOMAIN}
APP_URL=${MILLO_PUBLIC_SCHEME}://${MILLO_API_HOST}
CORS_ORIGIN=${MILLO_PUBLIC_SCHEME}://${MILLO_DOMAIN}

PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

EMAIL_PROVIDER=console
SENDGRID_API_KEY=

OAUTH_GOOGLE_CLIENT_ID=
OAUTH_GOOGLE_CLIENT_SECRET=
EOF
  chmod 600 "$ENV_FILE"
  warn "Edit $ENV_FILE for Stripe, OAuth, email (see packages/api/.env.example)."
else
  info "Keeping existing $ENV_FILE"
fi

# --- 8) Web build env ---------------------------------------------------------
WEB_ENV="$REPO_ROOT/packages/web/.env.production"
if [[ ! -f "$WEB_ENV" ]]; then
  info "Creating packages/web/.env.production…"
  cat > "$WEB_ENV" << EOF
VITE_API_URL=${MILLO_PUBLIC_SCHEME}://${MILLO_API_HOST}
VITE_WS_URL=${MILLO_WS_SCHEME}://${MILLO_API_HOST}
VITE_STRIPE_KEY=
EOF
fi

# --- 9) npm + build -----------------------------------------------------------
info "npm ci / install…"
if [[ -f "$REPO_ROOT/package-lock.json" ]]; then
  npm ci --prefix "$REPO_ROOT" || npm install --prefix "$REPO_ROOT"
else
  npm install --prefix "$REPO_ROOT"
fi

if [[ "${MILLO_SKIP_BOOTSTRAP_ADMIN}" != "1" ]]; then
  info "Bootstrap administrator (if none)…"
  if [[ "${EUID:-0}" -eq 0 ]] && [[ -z "${MILLO_CREDENTIALS_FILE:-}" ]]; then
    export MILLO_CREDENTIALS_FILE="/root/.millo-install-credentials.txt"
  fi
  ( cd "$REPO_ROOT" && node scripts/bootstrap-initial-admin.js ) || warn "bootstrap-initial-admin failed — npm run bootstrap:admin"
fi

info "npm run build…"
cd "$REPO_ROOT"
npm run build

# --- 10) Static web -----------------------------------------------------------
if [[ -x "$REPO_ROOT/infra/deploy-web.sh" ]]; then
  bash "$REPO_ROOT/infra/deploy-web.sh"
else
  warn "infra/deploy-web.sh missing — copying dist…"
  if [[ -d "$REPO_ROOT/packages/web/dist" ]]; then
    cp -r "$REPO_ROOT/packages/web/dist/"* /var/www/millo/web/
  fi
fi

mkdir -p "$REPO_ROOT/logs"
chown -R www-data:www-data /var/www/millo 2>/dev/null || true

# --- 11) Nginx ----------------------------------------------------------------
NGX_TMPL="$REPO_ROOT/infra/nginx/milloapp.com.conf.template"
NGX_SITE="/etc/nginx/sites-available/milloapp.com"
if [[ -f "$NGX_TMPL" ]]; then
  export MILLO_DOMAIN MILLO_API_HOST MILLO_API_PORT
  # shellcheck disable=SC2016
  envsubst '${MILLO_DOMAIN} ${MILLO_API_HOST} ${MILLO_API_PORT}' < "$NGX_TMPL" > "$NGX_SITE"
else
  warn "Missing $NGX_TMPL — configure Nginx manually."
fi

if [[ -f "$NGX_SITE" ]]; then
  ln -sf "$NGX_SITE" /etc/nginx/sites-enabled/milloapp.com
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
fi

# --- 12) TLS ------------------------------------------------------------------
if [[ "$MILLO_SKIP_SSL" != "1" ]]; then
  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    warn "LETSENCRYPT_EMAIL unset — skip certbot."
  else
    info "certbot for ${MILLO_DOMAIN}, www, ${MILLO_API_HOST}…"
    if ! certbot --nginx -d "${MILLO_DOMAIN}" -d "www.${MILLO_DOMAIN}" -d "${MILLO_API_HOST}" --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect; then
      warn "certbot failed — fix DNS and re-run certbot."
    fi
  fi
else
  warn "MILLO_SKIP_SSL=1 — add TLS later (CDN or certbot)."
fi

# --- 13) PM2 ------------------------------------------------------------------
if [[ "$MILLO_START_PM2" == "1" ]]; then
  _pm2_block=0
  if [[ "$MILLO_FORCE_PM2_START" != "1" ]] && grep -qE '^STRIPE_SECRET_KEY=$|^STRIPE_SECRET_KEY=\s*$|^OAUTH_GOOGLE_CLIENT_ID=$|^OAUTH_GOOGLE_CLIENT_ID=\s*$|PLACEHOLDER' "$ENV_FILE" 2>/dev/null; then
    _pm2_block=1
  fi
  if [[ "$_pm2_block" -eq 1 ]]; then
    warn "PM2 skipped (empty Stripe/OAuth). Set keys or MILLO_FORCE_PM2_START=1."
  else
    if [[ -f "$REPO_ROOT/ecosystem.config.js" ]]; then
      info "PM2 start (ecosystem --env ${MILLO_PM2_ENV})…"
      cd "$REPO_ROOT"
      pm2 delete millo-api 2>/dev/null || true
      pm2 start ecosystem.config.js --env "$MILLO_PM2_ENV"
      pm2 save
      pm2 startup systemd -u root --hp /root 2>/dev/null || warn "Run: pm2 startup (as deploy user if non-root)"
    else
      warn "No ecosystem.config.js at repo root."
    fi
  fi
else
  info "PM2 skipped (MILLO_START_PM2!=1)."
fi

# --- Done ---------------------------------------------------------------------
info "Bootstrap complete."
echo ""
echo -e "${CYN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GRN}  Web:${NC}  ${MILLO_PUBLIC_SCHEME}://${MILLO_DOMAIN}"
echo -e "${GRN}  API:${NC}  ${MILLO_PUBLIC_SCHEME}://${MILLO_API_HOST}  → 127.0.0.1:${MILLO_API_PORT}"
echo -e "${GRN}  Repo:${NC} $REPO_ROOT"
echo -e "${CYN}════════════════════════════════════════════════════════════════${NC}"
if [[ -f /root/.millo-install-credentials.txt ]]; then
  warn "Admin credentials: /root/.millo-install-credentials.txt (delete after use)."
fi
if [[ "${MILLO_NODE_ENV:-}" != "production" ]]; then
  warn "NODE_ENV=${MILLO_NODE_ENV} — set production + real keys before launch."
fi
warn "Checklist: docs/PRODUCTION-CHECKLIST.md"
exit 0
