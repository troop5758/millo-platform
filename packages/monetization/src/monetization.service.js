/**
 * Creator Monetization Super System - unified orchestration.
 * https://milloapp.com
 */
const subscriptionService = require('./subscription.service');
const ppvUpsellService = require('./ppvUpsell.service');
const fanSegmentationService = require('./fanSegmentation.service');
const dynamicPricingService = require('./dynamicPricing.service');
const funnelService = require('./funnel.service');
const liveTicketService = require('./liveTicket.service');
const coinConversionService = require('./coinConversion.service');
const analyticsService = require('./analytics.service');

module.exports = {
  subscriptionService,
  ppvUpsellService,
  fanSegmentationService,
  dynamicPricingService,
  funnelService,
  liveTicketService,
  coinConversionService,
  analyticsService,
};
