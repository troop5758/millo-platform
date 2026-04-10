# Phase 1.5 — Application Bootstrap

**Owns:** API bootstrap, global error handler, health endpoint, React shell, Tailwind config, Light/Dark architecture (NO gradients).  
**Must NOT include:** Feature implementations, DB schema logic.  
**Depends on:** Phase 1.

---

## Deliverables

### API (Fastify)

| Deliverable | Location | Purpose |
|-------------|----------|---------|
| API bootstrap | `packages/api/src/index.js` | Config load, `build()`, `listen()`; starts server |
| API bootstrap | `packages/api/src/app.js` | `build(opts)` returns Fastify app |
| Global error handler | `packages/api/src/app.js` | `fastify.setErrorHandler()` — statusCode, error message |
| Health endpoint | `packages/api/src/app.js` | `GET /health` → `{ ok: true }` |
| Config binding | `packages/api/src/config.js` | `load()`: port, host, nodeEnv, appUrl (https://milloapp.com) |

### Web (React + Vite)

| Deliverable | Location | Purpose |
|-------------|----------|---------|
| React shell | `packages/web/src/main.jsx` | ReactDOM root, mounts App |
| React shell | `packages/web/src/App.jsx` | `BrowserRouter`, `Routes`, `Route`, layout shell |
| Tailwind config | `packages/web/tailwind.config.js` | content, darkMode: 'class', theme extend |
| Tailwind | `packages/web/postcss.config.js` | tailwindcss, autoprefixer |
| Light/Dark architecture | `packages/web/src/index.css` | `:root` (dark) and `.light` theme variables — **solid colors only, NO gradients** |
| Light/Dark toggle | `packages/web/src/components/ThemeToggle.jsx` | Toggles `.light` on `document.documentElement` |

---

## Validation

- **Structure:** `npm run validate:phase1.5` — checks API error handler, health route, config, React router, Tailwind, theme variables, no gradients in theme.
- **API boots:** `npm run start:api`, then `GET http://localhost:3000/health` returns 200 and `{ ok: true }`. Or run `node scripts/validate-bootstrap.js` (requires API on port 3000).
- **Web loads:** `npm run dev -w @millo/web`, open http://localhost:5173.

---

*Phase 1.5 complete. No feature implementations or DB schema logic. Proceed to next phase in order.*
