/**
 * PPV Content Service — create and manage PPV content.
 * https://milloapp.com
 */
const db = require('@millo/database');
const pricingService = require('./ppv.pricing.service');

async function createContent(creatorId, opts) {
  const {
    title,
    description,
    contentType,
    mediaUrl,
    thumbnailUrl,
    basePriceCents,
    subscriberDiscountPercent,
    regionOverrides,
    scheduledRelease,
    aiPriceEnabled,
    streamId,
    meta,
  } = opts || {};

  if (!title?.trim()) throw new Error('TITLE_REQUIRED');
  const priceCents = basePriceCents ?? 0;
  if (priceCents > 0 && !pricingService.validatePrice(priceCents)) {
    throw new Error('INVALID_PRICE');
  }

  const content = await db.PpvContent.create({
    creatorId,
    title: String(title || '').slice(0, 200),
    description: (description || '').slice(0, 2000),
    contentType: ['video', 'image', 'post', 'download', 'livestream_replay'].includes(contentType) ? contentType : 'video',
    mediaUrl: mediaUrl || null,
    thumbnailUrl: thumbnailUrl || null,
    basePriceCents: priceCents,
    subscriberDiscountPercent: Math.min(100, Math.max(0, subscriberDiscountPercent ?? 20)),
    regionOverrides: regionOverrides && typeof regionOverrides === 'object' ? regionOverrides : {},
    scheduledRelease: scheduledRelease ? new Date(scheduledRelease) : null,
    aiPriceEnabled: !!aiPriceEnabled,
    isActive: scheduledRelease ? false : true,
    streamId: streamId || null,
    meta: meta && typeof meta === 'object' ? meta : {},
  });

  return content.toObject();
}

async function listContent(creatorId, opts = {}) {
  const { status = 'all', limit = 50, offset = 0 } = opts;
  const query = { creatorId };
  if (status === 'active') query.isActive = true;
  if (status === 'scheduled') {
    query.scheduledRelease = { $ne: null, $gt: new Date() };
    query.isActive = false;
  }
  if (status === 'inactive') query.isActive = false;

  const [items, total] = await Promise.all([
    db.PpvContent.find(query).sort({ createdAt: -1 }).skip(offset).limit(Math.min(limit, 100)).lean(),
    db.PpvContent.countDocuments(query),
  ]);

  return { items, total };
}

async function getContent(contentId) {
  return db.PpvContent.findById(contentId).lean();
}

async function updateContent(creatorId, contentId, opts) {
  const content = await db.PpvContent.findById(contentId);
  if (!content) throw new Error('CONTENT_NOT_FOUND');
  if (content.creatorId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');

  const allowed = [
    'title', 'description', 'contentType', 'mediaUrl', 'thumbnailUrl',
    'subscriberDiscountPercent', 'regionOverrides', 'scheduledRelease',
    'aiPriceEnabled', 'isActive', 'streamId', 'meta',
  ];
  for (const key of allowed) {
    if (opts[key] !== undefined) {
      if (key === 'scheduledRelease') content[key] = opts[key] ? new Date(opts[key]) : null;
      else if (key === 'regionOverrides' && typeof opts[key] === 'object') content[key] = opts[key];
      else if (key === 'meta' && typeof opts[key] === 'object') content[key] = opts[key];
      else content[key] = opts[key];
    }
  }
  if (opts.title !== undefined) content.title = String(opts.title).slice(0, 200);
  if (opts.description !== undefined) content.description = String(opts.description).slice(0, 2000);

  await content.save();
  return content.toObject();
}

async function updateContentPrice(creatorId, contentId, basePriceCents) {
  const content = await db.PpvContent.findById(contentId);
  if (!content) throw new Error('CONTENT_NOT_FOUND');
  if (content.creatorId.toString() !== creatorId.toString()) throw new Error('FORBIDDEN');
  if (basePriceCents > 0 && !pricingService.validatePrice(basePriceCents)) throw new Error('INVALID_PRICE');

  content.basePriceCents = Math.max(0, basePriceCents);
  await content.save();
  return content.toObject();
}

module.exports = {
  createContent,
  listContent,
  getContent,
  updateContent,
  updateContentPrice,
};
