# Phase 5 — Live Filters SDK

**Owns:** Filters engine, SDK stubs, Kill-switch binding, Performance guard.  
**Must NOT include:** AI host, Commerce.  
**Depends on:** Phase 4.

---

## Filters engine

- **Path:** `packages/live/src/filtersEngine.js`
- **API:** `getFiltersEnabled()` (reads `LIVE_FILTERS_ENABLED`), `getAvailableFilters()` → `['none', 'passthrough']` (stub list), `applyFilter(source, filterId?, opts?)` → stub passthrough when enabled, `applyFilterWithGuard(source, filterId?, opts?)` → apply with timeout; on timeout returns source unchanged. No AI, no commerce.
- **Exported from:** `@millo/live` (used by API for status and list).

## Kill-switch binding

- **Config:** `LIVE_FILTERS_ENABLED` env. When set to `'false'`, filters are disabled instantly across all clients.
- **API:** `GET /live/filters/status` → `{ enabled: boolean }`. Implementation uses `live.getFiltersEnabled()` (single source of truth). Clients poll or fetch; when `enabled: false`, SDK stubs do not apply filters.

## Performance guard

- **API:** `applyFilterWithGuard(source, filterId, { maxMs?, getEnabled? })` in filters engine. If filter work exceeds `maxMs` (default 50), returns `source` unchanged. Keeps filter application from blocking; no AI or commerce logic.

## SDK stubs

### Web

- **Path:** `packages/web/src/sdk/liveFilters.js`
- **API:** `isEnabled(baseUrl?)` → fetches `GET {baseUrl}/live/filters/status`, returns `data.enabled`. `applyFilter(statusUrl?, source, filterId?)` → when `!await isEnabled(...)` returns `source` unchanged; otherwise passthrough.

### iOS

- **Path:** `packages/mobile/ios/LiveFiltersSDK.swift`
- **API:** `LiveFiltersSDK.filtersEnabled`. `applyFilter(source:filterId:)` → when `!filtersEnabled` returns source unchanged. `setFiltersEnabled(_:)` — call after fetching `/live/filters/status`.

### Android

- **Path:** `packages/mobile/android/LiveFiltersSDK.kt`
- **API:** `LiveFiltersSDK.filtersEnabled`, `applyFilter(source, filterId)`, `setFiltersEnabled(enabled)` — same contract as iOS.

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /live/filters/status | `{ enabled: boolean }` |
| GET | /live/filters/list | `{ filterIds: string[] }` |

## Validation

- **Kill-switch:** When `LIVE_FILTERS_ENABLED=false`, `getFiltersEnabled()` returns `false`.
- **Filters engine:** `getAvailableFilters()` returns non-empty array; `applyFilterWithGuard` returns source (stub) and respects timeout.

Run: `node scripts/validate-phase5.js` from repo root (no DB or server required).

---

*Phase 5 complete. No AI host or commerce. Proceed to next phase in specified order.*
