#!/usr/bin/env node
/**
 * Phase 2 validation: schema field/index docs, no controllers, indexes compile.
 * Run from repo root: node scripts/validate-phase2.js
 * Requires MONGODB_URI (or default localhost) for index compile step.
 */
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'packages', 'database', 'src');
const schemasPath = path.join(dbPath, 'schemas');

// 1) No controllers
const controllerPath = path.join(dbPath, 'controllers');
if (fs.existsSync(controllerPath)) {
  console.error('[validate-phase2] FAIL: packages/database/src/controllers exists. Phase 2 allows schemas only.');
  process.exit(1);
}
console.log('[validate-phase2] No controllers: OK');

// 2) Each schema file has Fields + Indexes in JSDoc
const schemaFiles = fs.readdirSync(schemasPath).filter((f) => f.endsWith('.js') && f !== 'index.js');
let missing = [];
for (const f of schemaFiles) {
  const content = fs.readFileSync(path.join(schemasPath, f), 'utf8');
  if (!content.includes('Fields:') || !content.includes('Indexes:')) {
    missing.push(f);
  }
}
if (missing.length) {
  console.error('[validate-phase2] FAIL: schema files missing "Fields:" and/or "Indexes:" in JSDoc:', missing.join(', '));
  process.exit(1);
}
console.log('[validate-phase2] Schema field/index docs:', schemaFiles.length, 'files OK');

// 3) Indexes compile (delegate to validate-schemas)
const { execSync } = require('child_process');
const script = path.join(__dirname, 'validate-schemas.js');
try {
  execSync(`node "${script}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  process.exit(e.status || 1);
}
