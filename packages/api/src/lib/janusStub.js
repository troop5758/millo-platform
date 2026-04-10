'use strict';
/**
 * Janus WebRTC stub — delegates to janusService.
 * https://milloapp.com
 */

const janusService = require('../services/live/janusService');

/**
 * Create subscriber feed for co-host (Janus VideoRoom plugin).
 * @param {string} streamId
 * @param {string} userId - co-host user id
 */
async function createSubscriberFeed(streamId, userId) {
  return janusService.createSubscriberFeed(streamId, userId);
}

module.exports = {
  createSubscriberFeed,
  // Re-export all janusService methods
  ...janusService,
};
