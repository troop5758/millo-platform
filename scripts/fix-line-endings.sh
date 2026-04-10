#!/bin/bash
# Strip CRLF from shell scripts so Linux/deploy hosts do not see $'\r' errors.
# Run from repo root: bash scripts/fix-line-endings.sh
# .gitattributes already forces *.sh eol=lf; use this after editing on Windows.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

strip_one() {
  local f="$1"
  if [ "$(uname -s)" = "Darwin" ]; then
    sed -i '' 's/\r$//' "$f"
  else
    sed -i 's/\r$//' "$f"
  fi
}

while IFS= read -r -d '' f; do
  strip_one "$f"
done < <(find "$ROOT/scripts" "$ROOT/infra" -type f -name '*.sh' -print0 2>/dev/null || true)

echo "[fix-line-endings] Normalized line endings for *.sh under scripts/ and infra/"
