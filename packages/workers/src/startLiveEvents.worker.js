/**
 * Start live events worker — activate events when scheduled time arrives.
 * Runs every minute via BullMQ. Updates LiveEvent status to 'live', notifies ticket holders.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { Worker } = require('bullmq');
const { connection } = require('./queues');

async function startLiveEvents() {
  const now = new Date();
  const results = [];

  const endEvents = await db.LiveEvent.find({
    status: 'live',
    $expr: { $lte: [{ $add: ['$scheduledStart', { $multiply: ['$durationMinutes', 60000] }] }, now] },
  }).lean();
  for (const e of endEvents) {
    try {
      await db.LiveEvent.findByIdAndUpdate(e._id, { $set: { status: 'completed' } });
      results.push({ eventId: e._id.toString(), action: 'ended' });
    } catch (err) {
      results.push({ eventId: e._id.toString(), action: 'ended', error: err.message });
    }
  }

  const events = await db.LiveEvent.find({
    status: 'scheduled',
    scheduledStart: { $lte: now },
  }).lean();

  for (const event of events) {
    try {
      await db.LiveEvent.findByIdAndUpdate(event._id, { $set: { status: 'live' } });

      const attendances = await db.EventAttendance.find({ eventId: event._id })
        .select('userId')
        .lean();
      const userIds = [...new Set(attendances.map((a) => String(a.userId)))];
      const notifications = userIds.map((userId) => ({
        userId,
        type: 'live_event_started',
        payload: {
          eventId: event._id.toString(),
          creatorId: event.creatorId?.toString(),
          title: event.title,
        },
      }));
      if (notifications.length) {
        await db.Notification.insertMany(notifications);
      }

      results.push({ eventId: event._id.toString(), notified: userIds.length });
    } catch (err) {
      results.push({ eventId: event._id.toString(), error: err.message });
    }
  }

  return { processed: events.length, results };
}

const worker = new Worker(
  'live-events',
  async (job) => {
    return await startLiveEvents();
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[startLiveEvents-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, startLiveEvents };
