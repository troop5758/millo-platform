'use strict';
/**
 * Generate unique tracking ID for support tickets: MIL-{timestamp}-{random6}.
 * https://milloapp.com
 */
function generateTrackingId() {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `MIL-${Date.now()}-${random}`;
}

module.exports = { generateTrackingId };
