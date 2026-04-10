/**
 * Stream reminder worker — notify followers 24h, 1h, 15min before scheduled stream.
 * Runs every 5 minutes. Sends in-app notification, push, and email (via `email` queue when Redis is configured).
 * https://milloapp.com
 */
const db = require('@millo/database');
const { emailQueue } = require('./queues');

const REMINDER_WINDOWS_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '15m': 15 * 60 * 1000,
};

const REMINDER_LABELS = {
  '24h': '24 hours',
  '1h': '1 hour',
  '15m': '15 minutes',
};

async function sendReminderToUser(userId, stream, window) {
  const title = stream.title || 'Live stream';
  const label = REMINDER_LABELS[window];
  const body = `${title} starts in ${label}`;
  const url = `${process.env.FRONTEND_URL || 'https://milloapp.com'}/live/upcoming`;

  await db.Notification.create({
    userId,
    type: 'stream_reminder',
    payload: {
      scheduledStreamId: stream._id.toString(),
      creatorId: stream.creatorId.toString(),
      title,
      window,
      scheduledStart: stream.scheduledStart,
    },
    read: false,
  }).catch(() => null);

  try {
    const { sendPushToUser } = require('@millo/notifications/src/push');
    const user = await db.User.findById(userId).select('pushTokens email').lean();
    if (user?.pushTokens?.length) {
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'queued',
        provider: 'push_direct_worker',
        templateKey: 'stream_reminder',
        meta: {
          scheduledStreamId: stream._id.toString(),
          creatorId: stream.creatorId.toString(),
          window,
          url,
        },
        createdAt: new Date(),
      }).catch(() => null);
      await sendPushToUser(user.pushTokens, {
        title: 'Stream reminder',
        body,
        data: { type: 'stream_reminder', scheduledStreamId: stream._id.toString(), url },
      });
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'sent',
        provider: 'push_direct_worker',
        templateKey: 'stream_reminder',
        deliveredAt: new Date(),
        meta: {
          scheduledStreamId: stream._id.toString(),
          creatorId: stream.creatorId.toString(),
          window,
          url,
        },
        createdAt: new Date(),
      }).catch(() => null);
    }
    if (user?.email) {
      const payload = {
        to: user.email,
        template: 'stream_reminder',
        data: {
          subject: `Reminder: ${title} starts in ${label}`,
          title: 'Stream reminder',
          body: `${title} by your followed creator starts in ${label}. Don't miss it!`,
          ctaUrl: url,
          ctaText: 'View stream',
        },
      };
      try {
        await emailQueue.add('send', payload);
      } catch {
        const { sendEmail } = require('@millo/notifications');
        await sendEmail({
          to: payload.to,
          subject: payload.data.subject,
          title: payload.data.title,
          body: payload.data.body,
          ctaUrl: payload.data.ctaUrl,
          ctaText: payload.data.ctaText,
        }).catch(() => null);
      }
    }
  } catch (e) {
    await db.NotificationLog.create({
      userId,
      type: 'push',
      status: 'failed',
      provider: 'push_direct_worker',
      templateKey: 'stream_reminder',
      error: String(e?.message || e).slice(0, 2000),
      meta: {
        scheduledStreamId: stream._id.toString(),
        creatorId: stream.creatorId.toString(),
        window,
      },
      createdAt: new Date(),
    }).catch(() => null);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[streamReminder] push/email failed:', e.message);
    }
  }
}

async function sendEventReminderToUser(userId, event, window) {
  const title = event.title || 'Live event';
  const label = REMINDER_LABELS[window];
  const body = `${title} starts in ${label}`;
  const url = `${process.env.FRONTEND_URL || 'https://milloapp.com'}/live/events/${event._id}`;

  await db.Notification.create({
    userId,
    type: 'event_reminder',
    payload: {
      eventId: event._id.toString(),
      creatorId: event.creatorId.toString(),
      title,
      window,
      scheduledStart: event.scheduledStart,
    },
    read: false,
  }).catch(() => null);

  try {
    const { sendPushToUser } = require('@millo/notifications/src/push');
    const user = await db.User.findById(userId).select('pushTokens email').lean();
    if (user?.pushTokens?.length) {
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'queued',
        provider: 'push_direct_worker',
        templateKey: 'event_reminder',
        meta: {
          eventId: event._id.toString(),
          creatorId: event.creatorId.toString(),
          window,
          url,
        },
        createdAt: new Date(),
      }).catch(() => null);
      await sendPushToUser(user.pushTokens, {
        title: 'Event reminder',
        body,
        data: { type: 'event_reminder', eventId: event._id.toString(), url },
      });
      await db.NotificationLog.create({
        userId,
        type: 'push',
        status: 'sent',
        provider: 'push_direct_worker',
        templateKey: 'event_reminder',
        deliveredAt: new Date(),
        meta: {
          eventId: event._id.toString(),
          creatorId: event.creatorId.toString(),
          window,
          url,
        },
        createdAt: new Date(),
      }).catch(() => null);
    }
    if (user?.email) {
      const payload = {
        to: user.email,
        template: 'event_reminder',
        data: {
          subject: `Reminder: ${title} starts in ${label}`,
          title: 'Event reminder',
          body: `${title} by your followed creator starts in ${label}. Don't miss it!`,
          ctaUrl: url,
          ctaText: 'View event',
        },
      };
      try {
        await emailQueue.add('send', payload);
      } catch {
        const { sendEmail } = require('@millo/notifications');
        await sendEmail({
          to: payload.to,
          subject: payload.data.subject,
          title: payload.data.title,
          body: payload.data.body,
          ctaUrl: payload.data.ctaUrl,
          ctaText: payload.data.ctaText,
        }).catch(() => null);
      }
    }
  } catch (e) {
    await db.NotificationLog.create({
      userId,
      type: 'push',
      status: 'failed',
      provider: 'push_direct_worker',
      templateKey: 'event_reminder',
      error: String(e?.message || e).slice(0, 2000),
      meta: {
        eventId: event._id.toString(),
        creatorId: event.creatorId.toString(),
        window,
      },
      createdAt: new Date(),
    }).catch(() => null);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[eventReminder] push/email failed:', e.message);
    }
  }
}

async function processReminders() {
  const now = Date.now();
  const results = { '24h': 0, '1h': 0, '15m': 0 };

  // Tolerance: 5 min (worker runs every 5 min) — catch streams in each reminder window
  const TOLERANCE_MS = 5 * 60 * 1000;

  for (const [window, windowMs] of Object.entries(REMINDER_WINDOWS_MS)) {
    const windowStart = new Date(now + windowMs - TOLERANCE_MS);
    const windowEnd = new Date(now + windowMs + TOLERANCE_MS);

    const streams = await db.ScheduledStream.find({
      status: 'scheduled',
      scheduledStart: { $gte: windowStart, $lte: windowEnd },
      notifyFollowers: true,
      remindersSent: { $ne: window },
    }).lean();

    for (const s of streams) {
      const followers = await db.Follow.find({ followingId: s.creatorId }).select('followerId').lean();
      for (const f of followers) {
        await sendReminderToUser(f.followerId, s, window);
      }
      await db.ScheduledStream.findByIdAndUpdate(s._id, {
        $addToSet: { remindersSent: window },
      });
      results[window] += streams.length;
    }

    const events = await db.LiveEvent.find({
      status: 'scheduled',
      scheduledStart: { $gte: windowStart, $lte: windowEnd },
      remindersSent: { $ne: window },
    }).lean();

    for (const e of events) {
      const attendances = await db.EventAttendance.find({ eventId: e._id }).select('userId').lean();
      const ticketHolderIds = [...new Set(attendances.map((a) => String(a.userId)))];
      const followers = await db.Follow.find({ followingId: e.creatorId }).select('followerId').lean();
      const followerIds = [...new Set(followers.map((f) => String(f.followerId)))];
      const recipientIds = [...new Set([...ticketHolderIds, ...followerIds])];
      for (const uid of recipientIds) {
        await sendEventReminderToUser(uid, e, window);
      }
      await db.LiveEvent.findByIdAndUpdate(e._id, {
        $addToSet: { remindersSent: window },
      });
      results[window] += events.length;
    }
  }

  return results;
}

const { Worker } = require('bullmq');
const { connection } = require('./queues');

const worker = new Worker(
  'stream-reminder',
  async (job) => processReminders(),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[streamReminder-worker] Job failed', job?.id, err.message);
});

module.exports = { worker, processReminders };
