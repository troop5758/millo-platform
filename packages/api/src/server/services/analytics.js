'use strict';

/**
 * Phase 7 compatibility: /server/services/analytics.js
 * Enterprise adapter over existing analyticsService providers.
 *
 * `trackEvent(event)` accepts:
 *   { name, userId, distinctId, props, eventProperties }
 * and fans out to Mixpanel + Amplitude when configured.
 */
const analyticsService = require('../../services/analyticsService');

async function trackEvent(event = {}) {
  const name = String(event.name || event.event || 'unknown_event');
  const userId = event.userId || event.distinctId || null;
  const props = event.props || event.eventProperties || {};

  // Keep requested behavior visible in all environments.
  // eslint-disable-next-line no-console
  console.log('TRACK:', { name, userId, ...props });

  const results = await Promise.allSettled([
    analyticsService.sendMixpanelEvent(name, userId || 'anonymous', props),
    analyticsService.sendAmplitudeEvent(name, userId || 'anonymous', props),
  ]);

  return {
    ok: true,
    providers: {
      mixpanel: results[0].status === 'fulfilled' ? results[0].value : null,
      amplitude: results[1].status === 'fulfilled' ? results[1].value : null,
    },
  };
}

module.exports = { trackEvent };

