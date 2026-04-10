/**
 * Video controller (production).
 * Fastify-style equivalent of Express `getVideo(req, res)`.
 *
 * Used for:
 *  - GET /content/vod/:id  (stream recording or event replay)
 */
'use strict';

const db = require('@millo/database');

/** Attach sound attribution (🎵 Sound: Title) to streams. */
async function attachVideoSounds(streamList) {
  if (!streamList?.length) return {};
  const videoIds = streamList.map((s) => s._id);
  const videoSounds = await db.VideoSound.find({ videoId: { $in: videoIds } }).lean();
  if (!videoSounds.length) return {};

  const soundIds = [...new Set(videoSounds.map((vs) => vs.soundId))];
  const tracks = await db.MusicTrack.find({ _id: { $in: soundIds } }).select('_id title artist').lean();
  const trackMap = Object.fromEntries(tracks.map((t) => [String(t._id), t]));

  const out = {};
  for (const vs of videoSounds) {
    const track = trackMap[String(vs.soundId)];
    const title = track ? (track.title || 'Unknown') : 'Unknown';
    out[String(vs.videoId)] = {
      videoId: vs.videoId,
      soundId: vs.soundId,
      creatorId: vs.creatorId,
      startTime: vs.startTime,
      duration: vs.duration,
      title,
      artist: track?.artist || null,
      soundDisplay: `🎵 Sound: ${title}`,
    };
  }
  return out;
}

async function getVideo(request, reply) {
  const id = request.params?.id;
  const stream = await db.LiveStream.findById(id).lean();

  if (stream && (stream.recordingUrl || stream.meta?.recordingUrl)) {
    if (stream.removedAt) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Content unavailable' });
    }

    const profile = await db.Profile.findOne({ userId: stream.userId }).lean().catch(() => null);
    const soundMap = await attachVideoSounds([stream]);
    const sound = soundMap[String(stream._id)] || null;

    return reply.send({
      ...stream,
      recordingUrl: stream.recordingUrl || stream.meta?.recordingUrl,
      creator: profile || null,
      sound,
    });
  }

  const event = await db.LiveEvent.findById(id).lean();
  if (event && event.replayUrl) {
    const profile = await db.Profile.findOne({ userId: event.creatorId }).lean().catch(() => null);
    return reply.send({
      _id: event._id,
      userId: event.creatorId,
      title: event.title,
      description: event.description,
      thumbnailUrl: event.thumbnailUrl,
      recordingUrl: event.replayUrl,
      endedAt: event.scheduledStart,
      creator: profile || null,
      type: 'event',
      sound: null,
    });
  }

  return reply.status(404).send({ error: 'NOT_FOUND' });
}

module.exports = { getVideo };

