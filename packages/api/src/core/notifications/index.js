'use strict';
/**
 * Core notifications — https://milloapp.com
 */

const {
  QUEUE_NAME,
  getNotificationPipelineQueue,
  shouldEnqueueNotificationPipeline,
  normalizePipelineMessage,
  sendNotification,
} = require('./pipeline');

module.exports = {
  QUEUE_NAME,
  getNotificationPipelineQueue,
  shouldEnqueueNotificationPipeline,
  normalizePipelineMessage,
  sendNotification,
};
