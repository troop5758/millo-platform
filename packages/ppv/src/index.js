/**
 * Millo Advanced PPV System — pricing, unlock, bundles, messages, schedule, watermark, analytics.
 * https://milloapp.com
 */
const pricingService = require('./ppv.pricing.service');
const unlockService = require('./ppv.unlock.service');
const bundleService = require('./ppv.bundle.service');
const messageService = require('./ppv.message.service');
const scheduleService = require('./ppv.schedule.service');
const watermarkService = require('./ppv.watermark.service');
const analyticsService = require('./ppv.analytics.service');
const massMessageService = require('./ppv.massMessage.service');
const aiPriceOptimizationService = require('./ppv.aiPriceOptimization.service');
const scheduleReleaseService = require('./ppv.scheduleRelease.service');
const contentService = require('./ppv.content.service');

module.exports = {
  pricingService,
  unlockService,
  bundleService,
  messageService,
  scheduleService,
  watermarkService,
  analyticsService,
  massMessageService,
  aiPriceOptimizationService,
  scheduleReleaseService,
  contentService,
};
