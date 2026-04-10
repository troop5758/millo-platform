#!/bin/bash
# Launch checklist — automated pre-launch health checks.
# Usage: ./scripts/launch-check.sh
# Optional: DOMAIN=milloapp.com API_URL=https://api.milloapp.com ./scripts/launch-check.sh
# https://milloapp.com

set -e

DOMAIN="${DOMAIN:-milloapp.com}"
API_URL="${API_URL:-https://api.milloapp.com}"
BACKUPS_DIR="${BACKUPS_DIR:-/backups}"
FAILED=0

echo "=== Millo Launch Check ==="
echo "Domain: $DOMAIN | API: $API_URL | Backups: $BACKUPS_DIR"
echo ""

# 1. DNS
echo "[1/5] Checking DNS..."
if nslookup "$DOMAIN" >/dev/null 2>&1; then
  echo "  ✓ DNS resolves for $DOMAIN"
else
  echo "  ✗ DNS lookup failed for $DOMAIN"
  ((FAILED++)) || true
fi
echo ""

# 2. API health
echo "[2/5] Checking API health..."
if curl -sf --connect-timeout 10 "${API_URL}/health" >/dev/null 2>&1; then
  echo "  ✓ API health check passed"
else
  echo "  ✗ API health check failed (${API_URL}/health)"
  ((FAILED++)) || true
fi
echo ""

# 3. MongoDB
echo "[3/5] Checking database..."
if command -v mongosh >/dev/null 2>&1; then
  if [ -n "$MONGODB_URI" ]; then
    mongosh "$MONGODB_URI" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1 && echo "  ✓ MongoDB ping OK (mongosh)" || { echo "  ✗ MongoDB ping failed"; ((FAILED++)) || true; }
  else
    mongosh --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1 && echo "  ✓ MongoDB ping OK (mongosh)" || { echo "  ✗ MongoDB ping failed"; ((FAILED++)) || true; }
  fi
elif command -v mongo >/dev/null 2>&1; then
  if [ -n "$MONGODB_URI" ]; then
    mongo "$MONGODB_URI" --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1 && echo "  ✓ MongoDB ping OK (mongo)" || { echo "  ✗ MongoDB ping failed"; ((FAILED++)) || true; }
  else
    mongo --quiet --eval "db.runCommand({ ping: 1 })" >/dev/null 2>&1 && echo "  ✓ MongoDB ping OK (mongo)" || { echo "  ✗ MongoDB ping failed"; ((FAILED++)) || true; }
  fi
else
  echo "  ⚠ mongosh/mongo not found — skip DB check"
fi
echo ""

# 4. Redis
echo "[4/5] Checking Redis..."
if command -v redis-cli >/dev/null 2>&1; then
  if redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "  ✓ Redis ping OK"
  else
    echo "  ✗ Redis ping failed"
    ((FAILED++)) || true
  fi
else
  echo "  ⚠ redis-cli not found — skip Redis check"
fi
echo ""

# 5. Backups
echo "[5/5] Checking backups..."
if [ -d "$BACKUPS_DIR" ]; then
  COUNT=$(ls -1 "$BACKUPS_DIR" 2>/dev/null | wc -l)
  echo "  ✓ Backups dir exists ($COUNT items)"
else
  echo "  ✗ Backups dir not found: $BACKUPS_DIR"
  ((FAILED++)) || true
fi
echo ""

# Summary
echo "=== Summary ==="
if [ "$FAILED" -eq 0 ]; then
  echo "All checks passed. Ready for launch."
  exit 0
else
  echo "$FAILED check(s) failed. Resolve before launch."
  exit 1
fi
