'use strict';
/**
 * Live notification service — notify followers when streams are scheduled or started.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { notifyUser } = require('../lib/notifyUser');

/**
 * Notify all followers of a creator that a stream has been scheduled.
 * @param {object} stream - ScheduledStream document (creatorId, title, _id, scheduledStart)
 */
async function notifyFollowersScheduled(stream) {
  const followers = await db.Follow.find({ followingId: stream.creatorId })
    .select('followerId')
    .lean();

  const title = stream.title || 'Live stream';
  const scheduledFor = stream.scheduledStart ? new Date(stream.scheduledStart).toLocaleString() : '';
  const body = scheduledFor ? `${title} starts at ${scheduledFor}` : `${title} starts soon`;

  for (const f of followers) {
    await notifyUser(f.followerId, {
      type: 'live_scheduled',
      title,
      body,
      meta: {
        scheduledStreamId: stream._id.toString(),
        creatorId: stream.creatorId.toString(),
        scheduledStart: stream.scheduledStart,
      },
    }).catch(() => {});
  }

  return { notified: followers.length };
}

/**
 * Notify all followers of a creator that a live event has been scheduled.
 * @param {object} event - LiveEvent document (creatorId, title, _id, scheduledStart)
 */
async function notifyFollowersLiveEvent(event) {
  const followers = await db.Follow.find({ followingId: event.creatorId })
    .select('followerId')
    .lean();

  const title = event.title || 'Live event';
  const scheduledFor = event.scheduledStart ? new Date(event.scheduledStart).toLocaleString() : '';
  const body = scheduledFor ? `${title} is scheduled for ${scheduledFor}` : `${title} is scheduled`;

  for (const f of followers) {
    await notifyUser(f.followerId, {
      type: 'live_event',
      title,
      body,
      meta: {
        eventId: event._id.toString(),
        creatorId: event.creatorId.toString(),
        scheduledStart: event.scheduledStart,
      },
    }).catch(() => {});
  }

  return { notified: followers.length };
}

module.exports = { notifyFollowersScheduled, notifyFollowersLiveEvent };
