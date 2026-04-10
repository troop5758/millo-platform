/**
 * Stream lifecycle — start/end, stream key. All actions audited.
 * https://milloapp.com
 */
const crypto = require('crypto');
const db = require('@millo/database');

function generateStreamKey() {
  return 'millo_' + crypto.randomBytes(16).toString('hex');
}

async function startStream(userId, opts = {}) {
  const { title, visibility, category } = opts;
  const streamKey = generateStreamKey();
  const stream = await db.LiveStream.create({
    userId,
    status: 'live',
    visibility: visibility && ['public', 'private', 'paid'].includes(visibility) ? visibility : 'public',
    streamKey,
    startedAt: new Date(),
    title: title || null,
    category: category && String(category).trim() ? String(category).trim().slice(0, 64) : 'general',
  });

  const playbackTemplate = process.env.LIVE_PLAYBACK_URL_TEMPLATE || process.env.CDN_LIVE_PLAYBACK_TEMPLATE;
  if (playbackTemplate && typeof playbackTemplate === 'string') {
    stream.playbackUrl = playbackTemplate
      .replace(/\{streamKey\}/g, streamKey)
      .replace(/\{streamId\}/g, stream._id.toString());
    await stream.save();
  }

  await db.AuditLog.create({
    action: 'live.stream.start',
    actorId: userId,
    resourceType: 'LiveStream',
    resourceId: stream._id.toString(),
    meta: { streamId: stream._id.toString(), title, category: stream.category },
  });
  return stream.toObject();
}

async function endStream(streamId) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.status === 'ended') return stream.toObject();
  stream.status = 'ended';
  stream.endedAt = new Date();
  await stream.save();
  await db.AuditLog.create({
    action: 'live.stream.end',
    actorId: stream.userId,
    resourceType: 'LiveStream',
    resourceId: streamId.toString(),
    meta: { streamId: streamId.toString(), startedAt: stream.startedAt },
  });
  return stream.toObject();
}

async function getStream(streamId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) return null;
  return stream;
}

function getStreamKey(streamId) {
  return db.LiveStream.findById(streamId).select('streamKey userId').lean().then((s) => (s ? { streamKey: s.streamKey, userId: s.userId } : null));
}

module.exports = { startStream, endStream, getStream, getStreamKey, generateStreamKey };
