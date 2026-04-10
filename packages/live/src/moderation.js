/**
 * Moderation — stream moderation. ModerationLog + AuditLog.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function moderateStream(streamId, moderatorId, action, meta = {}) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  await db.ModerationLog.create({
    moderatorId,
    targetType: 'LiveStream',
    targetId: streamId.toString(),
    action,
    meta: { ...meta, streamOwnerId: stream.userId?.toString() },
  });
  await db.AuditLog.create({
    action: 'live.stream.moderate',
    actorId: moderatorId,
    resourceType: 'LiveStream',
    resourceId: streamId.toString(),
    meta: { streamId: streamId.toString(), moderationAction: action, ...meta },
  });
  if (action === 'suspend' && stream.status === 'live') {
    stream.status = 'ended';
    stream.endedAt = new Date();
    await stream.save();
    await db.AuditLog.create({
      action: 'live.stream.end',
      actorId: moderatorId,
      resourceType: 'LiveStream',
      resourceId: streamId.toString(),
      meta: { streamId: streamId.toString(), reason: 'moderation_suspend' },
    });
  }
  return { ok: true, streamId, action };
}

module.exports = { moderateStream };
