# Go-Live Gate (Focused)

Production domain: `https://milloapp.com`

Use this focused gate to quickly verify the most critical production invariants after runtime wiring changes.

## Command

```bash
npm run go-live-gate
```

## Staging smoke (runtime)

Linux/macOS (bash):

```bash
BASE_URL="https://api-staging.milloapp.com" \
ADMIN_TOKEN="..." \
USER_TOKEN="..." \
npm run staging:smoke
```

Windows (PowerShell):

```powershell
$env:BASE_URL="https://api-staging.milloapp.com"
$env:ADMIN_TOKEN="..."
$env:USER_TOKEN="..."
npm run staging:smoke:win
```

GitHub Actions (manual):

- Open the **CI/CD** workflow via **Run workflow**
- Set `run_staging_smoke=true`
- Configure repository secrets:
  - `STAGING_BASE_URL` (required)
  - `STAGING_ADMIN_TOKEN` (required)
  - `STAGING_USER_TOKEN` (optional; enables user-gated probes)
  - `STAGING_EXPECT_PAYMENTS_DISABLED` / `STAGING_EXPECT_PAYOUTS_DISABLED` / `STAGING_EXPECT_KYC_DISABLED` (optional)
- The workflow uploads `staging-smoke-report` (log artifact) on every run, including failures.

## What it runs

1. `npm run install:verify`
2. `npm run validate:schemas`
3. `npm run validate:phase9`
4. `npm run validate:phase20`

The script stops at the first failure and prints a concise summary.

## When to use

- After changing payment/payout/kyc enforcement.
- After changing notification delivery or audit/security behavior.
- Before staging promotion.

## Full sweep

For a complete end-to-end validation pass:

```bash
npm run production-gate
```

