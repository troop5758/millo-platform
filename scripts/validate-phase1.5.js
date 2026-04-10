#!/usr/bin/env node
/**
 * Phase 1.5 — Application Bootstrap validation.
 * Checks: API bootstrap, global error handler, health, React shell, Tailwind, Light/Dark (no gradients in theme).
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

let failed = 0;

// API bootstrap: app.js has build(), setErrorHandler, get('/health'); config.js has load(); index.js starts server
const appJs = fs.readFileSync(path.join(root, 'packages/api/src/app.js'), 'utf8');
if (!appJs.includes('setErrorHandler')) {
  console.error('API: missing setErrorHandler (global error handler)');
  failed++;
}
if (!appJs.includes("/health") || !appJs.includes('ok')) {
  console.error('API: missing GET /health or { ok: true }');
  failed++;
}
if (!appJs.includes('build(')) {
  console.error('API: missing build()');
  failed++;
}

const configJs = fs.readFileSync(path.join(root, 'packages/api/src/config.js'), 'utf8');
if (!configJs.includes('load') || !configJs.includes('milloapp.com')) {
  console.error('API config: missing load() or domain binding');
  failed++;
}

const apiIndex = fs.readFileSync(path.join(root, 'packages/api/src/index.js'), 'utf8');
if (!apiIndex.includes('load') || !apiIndex.includes('build') || !apiIndex.includes('listen')) {
  console.error('API index: missing config load, build, or listen');
  failed++;
}

// React shell: main.jsx, App.jsx with Router, index.css with @tailwind
if (!fs.existsSync(path.join(root, 'packages/web/src/main.jsx'))) {
  console.error('Web: missing main.jsx');
  failed++;
}
const appJsx = fs.readFileSync(path.join(root, 'packages/web/src/App.jsx'), 'utf8');
if (!appJsx.includes('BrowserRouter') && !appJsx.includes('Routes')) {
  console.error('Web: App.jsx missing router (BrowserRouter/Routes)');
  failed++;
}

const indexCss = fs.readFileSync(path.join(root, 'packages/web/src/index.css'), 'utf8');
if (!indexCss.includes('@tailwind base') || !indexCss.includes('@tailwind components') || !indexCss.includes('@tailwind utilities')) {
  console.error('Web: index.css missing @tailwind directives');
  failed++;
}
if (!indexCss.includes('--bg') || !indexCss.includes('--text')) {
  console.error('Web: index.css missing theme variables (--bg, --text)');
  failed++;
}
const themeSection = indexCss.slice(0, (indexCss.indexOf('@layer components') >= 0 ? indexCss.indexOf('@layer components') : indexCss.length));
if (/(?:linear-gradient|radial-gradient)\s*\(|gradient-to-/.test(themeSection)) {
  console.error('Web: Phase 1.5 Light/Dark architecture must NOT use gradients in theme');
  failed++;
}

// Tailwind config
if (!fs.existsSync(path.join(root, 'packages/web/tailwind.config.js'))) {
  console.error('Web: missing tailwind.config.js');
  failed++;
} else {
  const tw = fs.readFileSync(path.join(root, 'packages/web/tailwind.config.js'), 'utf8');
  if (!tw.includes('darkMode') && !tw.includes('class')) {
    console.error('Web: tailwind.config.js should have darkMode for Light/Dark');
  }
}

// Light/Dark: ThemeToggle or class toggling
const hasThemeToggle = fs.existsSync(path.join(root, 'packages/web/src/components/ThemeToggle.jsx'));
const hasLightClass = indexCss.includes('.light') || indexCss.includes('class');
if (!hasThemeToggle && !hasLightClass) {
  console.error('Web: missing ThemeToggle or .light theme class for Light/Dark');
  failed++;
}

if (failed) {
  console.error('[validate-phase1.5]', failed, 'check(s) failed');
  process.exit(1);
}
console.log('[validate-phase1.5] Application bootstrap OK');
