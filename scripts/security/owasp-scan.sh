#!/bin/bash
# OWASP ZAP baseline scan — detects XSS, CSRF, auth bypass, header misconfiguration, injection.
# Run against a running API (e.g. npm run dev, or production).
# Usage: ./scripts/security/owasp-scan.sh [TARGET]
# Example: ./scripts/security/owasp-scan.sh https://api.milloapp.com
# https://milloapp.com

set -e

TARGET="${1:-http://localhost:3000}"
REPORT_DIR="${2:-scripts/security/reports}"
mkdir -p "$REPORT_DIR"
HTML_REPORT="${REPORT_DIR}/zap-report.html"
JSON_REPORT="${REPORT_DIR}/zap-report.json"

echo "[owasp-scan] Target: $TARGET"
echo "[owasp-scan] Reports: $HTML_REPORT, $JSON_REPORT"

# Use --network host on Linux so ZAP can reach localhost; omit on macOS/Windows
NET_OPT=""
if [ "$(uname)" = "Linux" ]; then
  NET_OPT="--network host"
fi

docker run --rm -t $NET_OPT \
  -v "$(pwd):/zap/wrk:rw" \
  owasp/zap2docker-stable \
  zap-baseline.py \
  -t "$TARGET" \
  -r "/zap/wrk/${HTML_REPORT}" \
  -J "/zap/wrk/${JSON_REPORT}"

echo "[owasp-scan] Done. View: $HTML_REPORT"
