# WEB TODO — HARDENING

## Keep UI honest

- [ ] Show provider/stub/read-only state where APIs already expose it (headers, response fields, or documented **`/health`** for ops-only context)
- [ ] Keep AI controls visibly read-only until persistence exists
- [ ] Keep seller onboarding visibly provider-dependent/stubbed where applicable
- [ ] Keep OAuth-disabled / provider-not-configured messaging consistent

## Discovery

- [ ] Do not imply stable infinite paging
- [ ] Keep best-effort paging semantics explicit (align with API `pagingMode` / `hasMore` when present)
- [ ] Keep fallback UI for incomplete feed rows
- [ ] Do not imply full hydration if rows still need extra data

## Payments

- [ ] Do not present payment reference search as universal lookup
- [ ] Only describe it as reference-based search where **`PaymentReference`** coverage exists
- [ ] Keep stub/provider mode visible where money UI depends on it

## i18n / auth / hygiene

- [ ] Keep locale parity for any new keys
- [ ] Do not treat DEV auth toggles as production authorization
- [ ] Keep admin hardening policy consistent across routed surfaces (see web route docs)
