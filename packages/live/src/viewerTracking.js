/**
 * Viewer tracking — join/leave. All actions audited.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function joinViewer(streamId, opts = {}) {
  const { userId, anonymousId } = opts;
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.status !== 'live') throw new Error('STREAM_NOT_LIVE');
  const viewer = await db.LiveViewer.create({
    streamId,
    userId: userId || undefined,
    anonymousId: anonymousId || undefined,
  });
  await db.AuditLog.create({
    action: 'live.viewer.join',
    actorId: userId || null,
    resourceType: 'LiveViewer',
    resourceId: viewer._id.toString(),
    meta: { streamId: streamId.toString(), viewerId: viewer._id.toString(), anonymousId: !!anonymousId },
  });
  return viewer.toObject();
}

async function leaveViewer(viewerId) {
  const viewer = await db.LiveViewer.findById(viewerId);
  if (!viewer) throw new Error('VIEWER_NOT_FOUND');
  if (viewer.leftAt) return viewer.toObject();
  viewer.leftAt = new Date();
  await viewer.save();
  await db.AuditLog.create({
    action: 'live.viewer.leave',
    actorId: viewer.userId || null,
    resourceType: 'LiveViewer',
    resourceId: viewerId.toString(),
    meta: { streamId: viewer.streamId.toString(), viewerId: viewerId.toString() },
  });
  return viewer.toObject();
}

async function getViewerCount(streamId) {
  const count = await db.LiveViewer.countDocuments({
    streamId,
    leftAt: null,
  });
  return count;
}

/** Record heartbeat for a viewer (keeps session active). Optional lastHeartbeatAt in LiveViewer meta. */
async function recordHeartbeat(streamId, viewerId) {
  const viewer = await db.LiveViewer.findById(viewerId);
  if (!viewer) throw new Error('VIEWER_NOT_FOUND');
  if (viewer.streamId.toString() !== streamId.toString()) throw new Error('VIEWER_NOT_IN_STREAM');
  if (viewer.leftAt) throw new Error('VIEWER_ALREADY_LEFT');
  viewer.lastHeartbeatAt = new Date();
  await viewer.save();
  return viewer.toObject();
}

module.exports = { joinViewer, leaveViewer, getViewerCount, recordHeartbeat };
