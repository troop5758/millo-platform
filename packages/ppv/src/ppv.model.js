/**
 * PPV model — re-exports PPV-related database models.
 * https://milloapp.com
 */
const db = require('@millo/database');

module.exports = {
  PpvPurchase: db.PpvPurchase,
  PpvBundle: db.PpvBundle,
  PpvMessage: db.PpvMessage,
  PpvAnalytics: db.PpvAnalytics,
  PpvContentAnalytics: db.PpvContentAnalytics,
  PpvContent: db.PpvContent,
  PpvMassMessage: db.PpvMassMessage,
  PpvContentPurchase: db.PpvContentPurchase,
  LiveStream: db.LiveStream,
};
