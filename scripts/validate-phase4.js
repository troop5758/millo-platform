#!/usr/bin/env node
/**
 * Phase 4 validation: Start/End works, actions audited.
 * Run from repo root. Requires MongoDB (MONGODB_URI).
 */
const path = require('path');
const db = require(path.join(__dirname, '..', 'packages', 'database', 'src', 'index.js'));
const live = require(path.join(__dirname, '..', 'packages', 'live', 'src', 'index.js'));

const mongoose = require('mongoose');

async function main() {
  await db.connect();
  const ObjectId = mongoose.Types.ObjectId;
  const userId = new ObjectId();

  console.log('[validate-phase4] Start stream...');
  const stream = await live.startStream(userId, { title: 'Phase4 test' });
  if (!stream._id || stream.status !== 'live' || !stream.startedAt) {
    console.error('[validate-phase4] FAIL: start stream invalid', stream);
    process.exit(1);
  }
  console.log('[validate-phase4] Start works: OK');

  const startAudit = await db.AuditLog.findOne({ action: 'live.stream.start', resourceId: stream._id.toString() }).lean();
  if (!startAudit) {
    console.error('[validate-phase4] FAIL: start action not audited');
    process.exit(1);
  }
  console.log('[validate-phase4] Start audited: OK');

  console.log('[validate-phase4] End stream...');
  const ended = await live.endStream(stream._id);
  if (ended.status !== 'ended' || !ended.endedAt) {
    console.error('[validate-phase4] FAIL: end stream invalid', ended);
    process.exit(1);
  }
  console.log('[validate-phase4] End works: OK');

  const endAudit = await db.AuditLog.findOne({ action: 'live.stream.end', resourceId: stream._id.toString() }).lean();
  if (!endAudit) {
    console.error('[validate-phase4] FAIL: end action not audited');
    process.exit(1);
  }
  console.log('[validate-phase4] End audited: OK');

  console.log('[validate-phase4] Validation passed.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[validate-phase4]', e);
  process.exit(1);
});
