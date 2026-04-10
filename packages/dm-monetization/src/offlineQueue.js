/**
 * Offline queue — queue events when offline; process when sync.
 * https://milloapp.com
 */
const db = require('@millo/database');
const sessions = require('./sessions');

async function enqueue(type, payload) {
  const event = await db.DMOfflineEvent.create({ type, payload });
  return event.toObject();
}

async function getPendingEvents() {
  return db.DMOfflineEvent.find({ processedAt: null }).sort({ createdAt: 1 }).lean();
}

async function processQueue() {
  const events = await getPendingEvents();
  const results = [];
  for (const event of events) {
    try {
      if (event.type === 'session_end') {
        await sessions.endSession(event.payload.sessionId);
      } else if (event.type === 'session_approve') {
        await sessions.approveSession(event.payload.sessionId, event.payload.creatorId);
      }
      await db.DMOfflineEvent.updateOne({ _id: event._id }, { processedAt: new Date() });
      results.push({ eventId: event._id, ok: true });
    } catch (e) {
      results.push({ eventId: event._id, ok: false, error: e.message });
    }
  }
  return results;
}

async function syncOfflineQueue() {
  return processQueue();
}

module.exports = { enqueue, getPendingEvents, processQueue, syncOfflineQueue };
