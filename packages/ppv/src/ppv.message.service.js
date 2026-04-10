/**
 * PPV Message Service — announcements and reminders for PPV events.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function createMessage(creatorId, streamId, opts) {
  const { type, title, body, scheduledAt, targetAudience } = opts || {};
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.userId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');
  const msg = await db.PpvMessage.create({
    streamId,
    creatorId,
    type: type || 'announcement',
    title: String(title || '').slice(0, 200),
    body: String(body || '').slice(0, 2000),
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    targetAudience: targetAudience || 'all',
  });
  return msg.toObject();
}

async function listMessages(streamId, type) {
  const query = { streamId };
  if (type) query.type = type;
  const messages = await db.PpvMessage.find(query).sort({ createdAt: -1 }).lean();
  return messages;
}

async function getRecipientsForMessage(messageId) {
  const msg = await db.PpvMessage.findById(messageId);
  if (!msg) throw new Error('MESSAGE_NOT_FOUND');
  let userIds = [];
  if (msg.targetAudience === 'subscribers') {
    const subs = await db.Subscription.find({ creatorId: msg.creatorId, status: 'active' }).select('userId').lean();
    userIds = subs.map((s) => s.userId.toString());
  } else if (msg.targetAudience === 'followers') {
    const follows = await db.Follow.find({ followingId: msg.creatorId }).select('followerId').lean();
    userIds = follows.map((f) => f.followerId.toString());
  } else if (msg.targetAudience === 'purchasers') {
    const purchases = await db.PpvPurchase.find({ streamId: msg.streamId }).select('userId').lean();
    userIds = [...new Set(purchases.map((p) => p.userId.toString()))];
  } else {
    const follows = await db.Follow.find({ followingId: msg.creatorId }).select('followerId').lean();
    userIds = follows.map((f) => f.followerId.toString());
    if (userIds.length === 0) {
      const subs = await db.Subscription.find({ creatorId: msg.creatorId, status: 'active' }).select('userId').lean();
      userIds = subs.map((s) => s.userId.toString());
    }
  }
  return [...new Set(userIds)];
}

async function sendMessage(messageId, notifyFn) {
  const msg = await db.PpvMessage.findById(messageId);
  if (!msg) throw new Error('MESSAGE_NOT_FOUND');
  if (msg.sentAt) return { sent: true, alreadySent: true };
  const userIds = await getRecipientsForMessage(messageId);
  if (typeof notifyFn === 'function') {
    for (const uid of userIds.slice(0, 500)) {
      try {
        await notifyFn(uid, { type: 'ppv_message', title: msg.title, body: msg.body, meta: { streamId: msg.streamId.toString(), messageId: msg._id.toString() } });
      } catch (e) { /* ignore */ }
    }
  }
  msg.sentAt = new Date();
  await msg.save();
  return { sent: true, recipientCount: userIds.length };
}

module.exports = { createMessage, listMessages, getRecipientsForMessage, sendMessage };
