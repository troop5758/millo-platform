/**
 * In-app notifications — create and list. https://milloapp.com
 */
const db = require('@millo/database');

async function create(userId, type, payload = {}) {
  const doc = await db.Notification.create({
    userId,
    type,
    read: false,
    payload,
  });
  return doc.toObject();
}

async function listForUser(userId, options = {}) {
  const limit = Math.min(Number(options.limit) || 50, 100);
  const unreadOnly = options.unreadOnly === true;
  const query = { userId };
  if (unreadOnly) query.read = false;
  const list = await db.Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return list;
}

async function markRead(notificationId, userId) {
  const doc = await db.Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { read: true } },
    { new: true }
  );
  return doc ? doc.toObject() : null;
}

/** Unread count for userId (e.g. dashboard badge). Phase 10 dashboards can use this. */
async function getUnreadCount(userId) {
  return db.Notification.countDocuments({ userId, read: false });
}

module.exports = { create, listForUser, markRead, getUnreadCount };
