/**
 * Offline queue sync works. Requires MongoDB + npm install. https://milloapp.com
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const db = require(path.resolve(__dirname, '../../database/src/index.js'));
const dmMonetization = require(path.resolve(__dirname, 'index.js'));
const mongoose = require('mongoose');

let connected = false;
let creatorId, userId, sessionId;

describe('offline queue sync', () => {
  beforeEach(async () => {
    if (!connected) {
      await db.connect();
      connected = true;
      creatorId = new mongoose.Types.ObjectId();
      userId = new mongoose.Types.ObjectId();
    }
    await db.DMOfflineEvent.deleteMany({});
    await db.DMSession.deleteMany({});
  });

  it('enqueue then syncOfflineQueue processes session_end (offline queue sync works)', async () => {
    const session = await dmMonetization.startSession(creatorId, userId);
    sessionId = session._id;
    await dmMonetization.enqueue('session_end', { sessionId: sessionId.toString() });
    const pendingBefore = await dmMonetization.getPendingEvents();
    assert.strictEqual(pendingBefore.length, 1);
    const results = await dmMonetization.syncOfflineQueue();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].ok, true);
    const pendingAfter = await dmMonetization.getPendingEvents();
    assert.strictEqual(pendingAfter.length, 0);
    const event = await db.DMOfflineEvent.findOne({});
    assert.ok(event.processedAt);
  });
});
