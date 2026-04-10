/**
 * Start scheduled streams worker — activate streams when scheduled time arrives.
 * Runs every minute via BullMQ. Creates LiveStream, updates ScheduledStream, notifies followers.
 * https://milloapp.com
 */
const db = require('@millo/database');
const live = require('@millo/live');
const { Worker } = require('bullmq');
const { connection, scheduledStreamsQueue } = require('./queues');

async function startScheduledStreams() {
  const now = new Date();
  const streams = await db.ScheduledStream.find({
    status: 'scheduled',
    scheduledStart: { $lte: now },
  }).lean();

  const results = [];
  for (const s of streams) {
    try {
      const visibility = s.streamType === 'paid_event' && s.priceCents > 0 ? 'paid' : 'public';
      const liveStream = await live.startStream(s.creatorId.toString(), {
        title: s.title || 'Live Stream',
        visibility,
      });

      await db.LiveStream.findByIdAndUpdate(liveStream._id, {
        $set: {
          thumbnailUrl: s.thumbnailUrl || undefined,
          priceCents: s.priceCents || 0,
          meta: { scheduledStreamId: s._id.toString(), streamType: s.streamType },
        },
      });

      if (s.productIds?.length) {
        const videoProducts = s.productIds.map((productId, i) => ({
          contentId: liveStream._id,
          productId,
          sortOrder: i,
        }));
        await db.VideoProduct.insertMany(videoProducts).catch(() => {});
      }

      await db.ScheduledStream.findByIdAndUpdate(s._id, {
        $set: { status: 'live', liveStreamId: liveStream._id },
      });

      if (s.notifyFollowers) {
        const followers = await db.Follow.find({ followingId: s.creatorId })
          .select('followerId')
          .lean();
        const notifications = followers.map((f) => ({
          userId: f.followerId,
          type: 'stream_started',
          payload: {
            streamId: liveStream._id.toString(),
            creatorId: s.creatorId.toString(),
            title: s.title,
            scheduledStreamId: s._id.toString(),
          },
        }));
        if (notifications.length) {
          await db.Notification.insertMany(notifications);
        }
      }

      results.push({ scheduledStreamId: s._id.toString(), liveStreamId: liveStream._id.toString() });
    } catch (err) {
      results.push({ scheduledStreamId: s._id.toString(), error: err.message });
    }
  }

  return { processed: streams.length, results };
}

const worker = new Worker(
  'scheduled-streams',
  async (job) => {
    return await startScheduledStreams();
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[startScheduledStreams-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, startScheduledStreams };
