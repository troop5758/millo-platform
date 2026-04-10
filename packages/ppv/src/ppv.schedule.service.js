/**
 * PPV Schedule Service — schedule PPV streams, set price and visibility.
 * https://milloapp.com
 */
const db = require('@millo/database');
const pricingService = require('./ppv.pricing.service');

async function schedulePpv(creatorId, streamId, priceCents) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.userId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');
  if (!pricingService.validatePrice(priceCents)) throw new Error('INVALID_PRICE');
  stream.visibility = 'paid';
  stream.priceCents = priceCents;
  await stream.save();
  return stream.toObject();
}

async function updatePpvPrice(creatorId, streamId, priceCents) {
  const stream = await db.LiveStream.findById(streamId);
  if (!stream) throw new Error('STREAM_NOT_FOUND');
  if (stream.userId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');
  if (stream.visibility !== 'paid') throw new Error('STREAM_NOT_PPV');
  if (!pricingService.validatePrice(priceCents)) throw new Error('INVALID_PRICE');
  stream.priceCents = priceCents;
  await stream.save();
  return stream.toObject();
}

async function getScheduledPpv(creatorId) {
  const streams = await db.LiveStream.find({
    userId: creatorId,
    visibility: 'paid',
    status: { $in: ['scheduled', 'live', 'ended'] },
  }).sort({ startedAt: -1 }).lean();
  return streams;
}

module.exports = { schedulePpv, updatePpvPrice, getScheduledPpv };
