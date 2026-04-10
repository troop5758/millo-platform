#!/usr/bin/env node
/**
 * Phase 14 validation: Live streaming core — Start/End works, actions audited.
 * Run from repo root. Requires MongoDB (MONGODB_URI). Checks docs/phase-14-live.md.
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

if (!fs.existsSync(path.join(root, 'docs/phase-14-live.md'))) {
  console.error('[validate-phase14] Missing docs/phase-14-live.md');
  process.exit(1);
}

const db = require(path.join(root, 'packages', 'database', 'src', 'index.js'));
const live = require(path.join(root, 'packages', 'live', 'src', 'index.js'));
const mongoose = require('mongoose');

async function main() {
  await db.connect();
  const ObjectId = mongoose.Types.ObjectId;
  const userId = new ObjectId();

  console.log('[validate-phase14] Live streaming — Start stream...');
  const stream = await live.startStream(userId, { title: 'Phase14 test' });
  if (!stream._id || stream.status !== 'live' || !stream.startedAt) {
    console.error('[validate-phase14] FAIL: start stream invalid', stream);
    process.exit(1);
  }
  console.log('[validate-phase14] Start works: OK');

  const startAudit = await db.AuditLog.findOne({ action: 'live.stream.start', resourceId: stream._id.toString() }).lean();
  if (!startAudit) {
    console.error('[validate-phase14] FAIL: start action not audited');
    process.exit(1);
  }
  console.log('[validate-phase14] Start audited: OK');

  console.log('[validate-phase14] End stream...');
  const ended = await live.endStream(stream._id);
  if (ended.status !== 'ended' || !ended.endedAt) {
    console.error('[validate-phase14] FAIL: end stream invalid', ended);
    process.exit(1);
  }
  console.log('[validate-phase14] End works: OK');

  const endAudit = await db.AuditLog.findOne({ action: 'live.stream.end', resourceId: stream._id.toString() }).lean();
  if (!endAudit) {
    console.error('[validate-phase14] FAIL: end action not audited');
    process.exit(1);
  }
  console.log('[validate-phase14] End audited: OK');

  console.log('[validate-phase14] Validation passed.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[validate-phase14]', e);
  process.exit(1);
});
