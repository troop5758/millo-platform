#!/usr/bin/env node
/**
 * Phase 2 validation: indexes compile, no controllers exist.
 * Run from repo root: node scripts/validate-schemas.js
 * Requires MONGODB_URI (or default localhost). Does not require DB to be empty.
 */
const path = require('path');

const dbPath = path.join(__dirname, '..', 'packages', 'database', 'src');
const schemasPath = path.join(dbPath, 'schemas');

// 1) No controllers: assert no controller files
const fs = require('fs');
const schemaFiles = fs.readdirSync(schemasPath).filter((f) => f.endsWith('.js') && f !== 'index.js');
const controllerPath = path.join(dbPath, 'controllers');
const controllersExist = fs.existsSync(controllerPath);
if (controllersExist) {
  console.error('[validate-schemas] FAIL: packages/database/src/controllers exists. Phase 2 allows schemas only.');
  process.exit(1);
}
console.log('[validate-schemas] No controllers: OK');

// 2) 24+ schemas
if (schemaFiles.length < 24) {
  console.error('[validate-schemas] FAIL: expected 24+ schema files, got', schemaFiles.length);
  process.exit(1);
}
console.log('[validate-schemas] 24+ schemas:', schemaFiles.length);

// 3) Indexes compile: load models and call syncIndexes (requires MongoDB)
async function compileIndexes() {
  const db = require(path.join(__dirname, '..', 'packages', 'database', 'src', 'index.js'));
  try {
    await db.connect();
    await db.syncIndexes();
    console.log('[validate-schemas] Indexes compile: OK');
  } catch (e) {
    console.error('[validate-schemas] Indexes compile: FAIL (is MongoDB running?)', e.message);
    process.exit(1);
  } finally {
    const mongoose = require('mongoose');
    await mongoose.disconnect();
  }
}

compileIndexes();
