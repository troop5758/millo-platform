/**
 * Live Ticket Service - live PPV events.
 * https://milloapp.com
 */
const ppv = require('@millo/ppv');
const db = require('@millo/database');

async function getLiveTickets(creatorId, status) {
  const query = { userId: creatorId, visibility: 'paid' };
  if (status && status !== 'all') query.status = status;
  else query.status = { $in: ['scheduled', 'live'] };
  return db.LiveStream.find(query).sort({ startedAt: 1 }).lean();
}

async function getTicketPrice(streamId, country) {
  const result = await ppv.pricingService.getStreamPrice(streamId, country);
  return result && result.priceCents ? result.priceCents : 0;
}

async function purchaseTicket(userId, streamId) {
  return ppv.unlockService.unlockStream(userId, streamId);
}

module.exports = {
  getLiveTickets,
  getTicketPrice,
  purchaseTicket,
};
