#!/usr/bin/env bash
set -euo pipefail

# Staging smoke test — focused runtime checks after deploy.
# Usage:
#   BASE_URL="https://api-staging.milloapp.com" ADMIN_TOKEN="..." USER_TOKEN="..." bash scripts/staging-smoke.sh
# Optional:
#   EXPECT_PAYMENTS_DISABLED=1 EXPECT_PAYOUTS_DISABLED=1 EXPECT_KYC_DISABLED=1

BASE_URL="${BASE_URL:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
USER_TOKEN="${USER_TOKEN:-}"

EXPECT_PAYMENTS_DISABLED="${EXPECT_PAYMENTS_DISABLED:-0}"
EXPECT_PAYOUTS_DISABLED="${EXPECT_PAYOUTS_DISABLED:-0}"
EXPECT_KYC_DISABLED="${EXPECT_KYC_DISABLED:-0}"

if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: BASE_URL is required"
  exit 1
fi
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ERROR: ADMIN_TOKEN is required"
  exit 1
fi

PASS=0
FAIL=0

ok()   { echo "[PASS] $1"; PASS=$((PASS+1)); }
bad()  { echo "[FAIL] $1"; FAIL=$((FAIL+1)); }
info() { echo "[INFO] $1"; }

http_code() {
  curl -sS -o /dev/null -w "%{http_code}" "$@"
}

json_has_key() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | jq -e "has(\"$key\")" >/dev/null 2>&1
}

info "BASE_URL=$BASE_URL"

info "1) Control plane"
cp_json="$(curl -sS "$BASE_URL/api/system/control-plane" || true)"
if [[ -n "$cp_json" ]] && json_has_key "$cp_json" "capabilities"; then
  ok "control-plane endpoint returned capabilities"
else
  bad "control-plane endpoint failed or invalid payload"
fi

info "2) Observability admin payload"
obs_code="$(http_code -H "Authorization: Bearer $ADMIN_TOKEN" "$BASE_URL/admin/metrics/observability")"
if [[ "$obs_code" == "200" ]]; then
  ok "admin observability endpoint authorized and healthy"
else
  bad "admin observability endpoint returned HTTP $obs_code"
fi

info "3) Health + metrics"
health_code="$(http_code "$BASE_URL/health")"
metrics_code="$(http_code "$BASE_URL/metrics")"
[[ "$health_code" == "200" || "$health_code" == "503" ]] && ok "/health reachable (HTTP $health_code)" || bad "/health unreachable (HTTP $health_code)"
[[ "$metrics_code" == "200" ]] && ok "/metrics reachable" || bad "/metrics unreachable (HTTP $metrics_code)"

if [[ -n "$USER_TOKEN" ]]; then
  info "4) Capability-gated payment probes"

  pay_code="$(http_code -X POST "$BASE_URL/payments/coins/intent" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"packId":"starter","deviceFingerprint":"fp-test-12345678"}')"

  if [[ "$EXPECT_PAYMENTS_DISABLED" == "1" ]]; then
    [[ "$pay_code" == "503" ]] && ok "payments disabled gate active (coins/intent => 503)" || bad "expected payments 503, got $pay_code"
  else
    [[ "$pay_code" != "503" ]] && ok "payments path not hard-blocked by control-plane" || bad "unexpected payments 503"
  fi

  payout_code="$(http_code -X POST "$BASE_URL/payments/payouts/request" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"amount":10}')"

  if [[ "$EXPECT_PAYOUTS_DISABLED" == "1" ]]; then
    [[ "$payout_code" == "503" ]] && ok "payouts disabled gate active (request => 503)" || bad "expected payouts 503, got $payout_code"
  else
    [[ "$payout_code" != "503" ]] && ok "payouts path not hard-blocked by control-plane" || bad "unexpected payouts 503"
  fi

  kyc_code="$(http_code -X POST "$BASE_URL/payments/kyc/start" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"returnUrl":"https://milloapp.com/dashboard"}')"

  if [[ "$EXPECT_KYC_DISABLED" == "1" ]]; then
    [[ "$kyc_code" == "503" ]] && ok "kyc disabled gate active (kyc/start => 503)" || bad "expected kyc 503, got $kyc_code"
  else
    [[ "$kyc_code" != "503" ]] && ok "kyc path not hard-blocked by control-plane" || bad "unexpected kyc 503"
  fi
else
  info "Skipping user-gated probes because USER_TOKEN is unset"
fi

echo "----------------------------------------"
echo "Smoke Summary: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
echo "Staging smoke checks passed."

