'use strict';
/**
 * Ads / Campaigns routes — creator-managed ad campaigns.
 *
 * POST   /ads/campaigns               — create campaign
 * GET    /ads/campaigns               — list my campaigns
 * GET    /ads/campaigns/:id           — get campaign
 * PUT    /ads/campaigns/:id           — update campaign
 * DELETE /ads/campaigns/:id           — delete (draft only)
 *
 * POST   /ads/campaigns/:id/ads       — create ad for campaign
 * GET    /ads/campaigns/:id/ads       — list ads for campaign
 * PUT    /ads/:adId                   — update ad
 * DELETE /ads/:adId                   — delete ad
 *
 * GET    /ads/feed?placement=         — public: get active ads for placement
 * POST   /ads/:adId/impression        — public: record an impression
 * POST   /ads/:adId/click             — public: record a click
 *
 * Admin:
 * GET    /ads/admin/all               — all campaigns
 * POST   /ads/campaigns/:id/approve   — approve a campaign
 * POST   /ads/campaigns/:id/pause     — pause a campaign
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const { appendEntry } = require('@millo/economy');
const { resolveSession } = require('./auth');
const { writeAdminAuditLog } = require('../services/auditLog');
const { validateId } = require('../lib/validateId');
const adService = require('../services/ad.service');

function authUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function requireAuth(req, reply) {
  const user = await authUser(req);
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return null; }
  return user;
}

async function requireAdmin(req, reply) {
  const user = await authUser(req);
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return null; }
  if (user.role !== 'admin') { reply.status(403).send({ error: 'FORBIDDEN' }); return null; }
  return user;
}

const CAMPAIGN_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many campaigns created — please wait before creating another' }),
};

async function adsRoutes(app) {

  /* ── Create campaign ── */
  app.post('/ads/campaigns', { config: { rateLimit: CAMPAIGN_RATE_LIMIT } }, async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { name, objective = 'awareness', budgetCents = 0, dailyCapCents = 0, targetAudience = {}, startsAt, endsAt } = req.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: 'name required' });
    if (name.trim().length > 200) return reply.status(400).send({ error: 'NAME_TOO_LONG', message: 'Campaign name must be 200 characters or fewer' });
    const VALID_OBJECTIVES = ['awareness', 'conversions', 'followers'];
    if (!VALID_OBJECTIVES.includes(objective)) return reply.status(400).send({ error: 'INVALID_OBJECTIVE', message: `objective must be one of: ${VALID_OBJECTIVES.join(', ')}` });
    if (budgetCents !== undefined && (!Number.isInteger(Number(budgetCents)) || Number(budgetCents) < 0)) return reply.status(400).send({ error: 'INVALID_BUDGET', message: 'budgetCents must be a non-negative integer' });
    if (targetAudience !== undefined && (typeof targetAudience !== 'object' || Array.isArray(targetAudience))) return reply.status(400).send({ error: 'INVALID_TARGET_AUDIENCE', message: 'targetAudience must be an object' });
    let campaign;
    try {
      campaign = await db.Campaign.create({
        creatorId: user._id,
        name:      name.trim(),
        objective,
        budgetCents:    Number(budgetCents),
        dailyCapCents:  Number(dailyCapCents),
        targetAudience,
        startsAt:  startsAt ? new Date(startsAt) : undefined,
        endsAt:    endsAt   ? new Date(endsAt)   : undefined,
      });
    } catch (err) {
      req.log.error({ err, userId: String(user._id) }, 'Failed to create ad campaign');
      return reply.status(500).send({ error: 'CREATE_FAILED', message: 'Failed to create campaign' });
    }
    return reply.status(201).send({ ok: true, campaign: campaign.toObject() });
  });

  /* ── List my campaigns ── */
  app.get('/ads/campaigns', async (req, reply) => {
    const user = await requireAuth(req, reply);
    if (!user) return;
    const { status, limit = 20, offset = 0 } = req.query ?? {};
    const query = { creatorId: user._id };
    if (status) query.status = status;
    const [campaigns, total] = await Promise.all([
      db.Campaign.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 50)).lean(),
      db.Campaign.countDocuments(query),
    ]);
    return reply.send({ campaigns, total });
  });

  /* ── Get single campaign ── */
  app.get('/ads/campaigns/:id', async (req, reply) => {
    if (!validateId(req.params.id, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const campaign = await db.Campaign.findOne({ _id: req.params.id, creatorId: user._id }).lean();
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    const ads = await db.Ad.find({ campaignId: campaign._id }).lean();
    return reply.send({ campaign, ads });
  });

  /* ── Update campaign ── */
  app.put('/ads/campaigns/:id', async (req, reply) => {
    if (!validateId(req.params.id, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const campaign = await db.Campaign.findOne({ _id: req.params.id, creatorId: user._id });
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    const allowed = ['name', 'objective', 'budgetCents', 'dailyCapCents', 'targetAudience', 'startsAt', 'endsAt', 'status'];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'status' && !['draft', 'paused', 'ended'].includes(req.body[k])) continue; // can't self-activate
        campaign[k] = req.body[k];
      }
    }
    await campaign.save();
    return reply.send({ ok: true, campaign: campaign.toObject() });
  });

  /* ── Delete campaign (draft only) ── */
  app.delete('/ads/campaigns/:id', async (req, reply) => {
    if (!validateId(req.params.id, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const campaign = await db.Campaign.findOne({ _id: req.params.id, creatorId: user._id });
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (campaign.status !== 'draft') return reply.status(409).send({ error: 'Only draft campaigns can be deleted' });
    await db.Ad.deleteMany({ campaignId: campaign._id });
    await campaign.deleteOne();
    return reply.send({ ok: true });
  });

  /* ── Create ad for a campaign ── */
  app.post('/ads/campaigns/:id/ads', async (req, reply) => {
    if (!validateId(req.params.id, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const campaign = await db.Campaign.findOne({ _id: req.params.id, creatorId: user._id }).lean();
    if (!campaign) return reply.status(404).send({ error: 'CAMPAIGN_NOT_FOUND' });
    const {
      placement: placementBody = 'feed',
      adSurface = 'in_feed',
      format = 'native',
      headline,
      description,
      ctaText,
      ctaUrl,
      imageUrl,
      videoUrl,
      target_regions,
      country,
      language,
      ageGroup,
      interestTags,
      cpmCents = 0,
      bidCents = 0,
      targeting = {},
    } = req.body ?? {};
    let placement = placementBody;
    if (adSurface === 'pre_roll_live') placement = 'live';
    if (!['feed', 'live', 'search', 'profile', 'story'].includes(placement)) {
      return reply.status(400).send({ error: 'INVALID_PLACEMENT' });
    }
    const VALID_AD_SURFACES = ['in_feed', 'pre_roll_live', 'sponsored_creator'];
    if (!VALID_AD_SURFACES.includes(adSurface)) {
      return reply.status(400).send({ error: 'INVALID_AD_SURFACE', message: `adSurface must be one of: ${VALID_AD_SURFACES.join(', ')}` });
    }
    if (headline    && headline.length    > 150)  return reply.status(400).send({ error: 'HEADLINE_TOO_LONG',    message: 'headline must be 150 characters or fewer' });
    if (description && description.length > 500)  return reply.status(400).send({ error: 'DESCRIPTION_TOO_LONG', message: 'description must be 500 characters or fewer' });
    if (ctaText     && ctaText.length     > 50)   return reply.status(400).send({ error: 'CTA_TEXT_TOO_LONG',    message: 'ctaText must be 50 characters or fewer' });
    if (ctaUrl      && ctaUrl.length      > 2000) return reply.status(400).send({ error: 'CTA_URL_TOO_LONG',     message: 'ctaUrl must be 2,000 characters or fewer' });
    const ad = await db.Ad.create({
      campaignId: campaign._id,
      creatorId:  user._id,
      placement,
      adSurface,
      format,
      headline:    headline    || '',
      description: description || '',
      ctaText:     ctaText     || 'Learn More',
      ctaUrl:      ctaUrl      || '',
      imageUrl:    imageUrl    || '',
      videoUrl:    videoUrl    || '',
      cpmCents: Math.max(0, Math.floor(Number(cpmCents) || 0)),
      bidCents: Math.max(0, Math.floor(Number(bidCents) || 0)),
      targeting: targeting && typeof targeting === 'object' && !Array.isArray(targeting) ? targeting : {},
      target_regions: Array.isArray(target_regions) ? target_regions.map((r) => String(r).toUpperCase().trim()).filter(Boolean) : [],
      country:   country   ? String(country).toUpperCase().trim().slice(0, 8) : null,
      language:  language  ? String(language).trim().slice(0, 16) : null,
      ageGroup:  ageGroup  ? String(ageGroup).trim().slice(0, 16) : null,
      interestTags: Array.isArray(interestTags) ? interestTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
    });
    return reply.status(201).send({ ok: true, ad: ad.toObject() });
  });

  /* ── List ads for a campaign ── */
  app.get('/ads/campaigns/:id/ads', async (req, reply) => {
    if (!validateId(req.params.id, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const campaign = await db.Campaign.findOne({ _id: req.params.id, creatorId: user._id }).lean();
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    const ads = await db.Ad.find({ campaignId: campaign._id }).lean();
    return reply.send({ ads });
  });

  /* ── Update ad ── */
  app.put('/ads/:adId', async (req, reply) => {
    if (!validateId(req.params.adId, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const ad = await db.Ad.findOne({ _id: req.params.adId, creatorId: user._id });
    if (!ad) return reply.status(404).send({ error: 'NOT_FOUND' });
    const allowed = [
      'placement',
      'adSurface',
      'format',
      'headline',
      'description',
      'ctaText',
      'ctaUrl',
      'imageUrl',
      'videoUrl',
      'status',
      'cpmCents',
      'bidCents',
      'targeting',
      'target_regions',
      'country',
      'language',
      'ageGroup',
      'interestTags',
    ];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        if (k === 'status' && !['draft', 'paused'].includes(req.body[k])) continue;
        if (k === 'target_regions') {
          ad[k] = Array.isArray(req.body[k]) ? req.body[k].map((r) => String(r).toUpperCase().trim()).filter(Boolean) : [];
        } else if (k === 'country') {
          ad[k] = req.body[k] ? String(req.body[k]).toUpperCase().trim().slice(0, 8) : null;
        } else if (k === 'language') {
          ad[k] = req.body[k] ? String(req.body[k]).trim().slice(0, 16) : null;
        } else if (k === 'ageGroup') {
          ad[k] = req.body[k] ? String(req.body[k]).trim().slice(0, 16) : null;
        } else if (k === 'interestTags') {
          ad[k] = Array.isArray(req.body[k]) ? req.body[k].map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];
        } else if (k === 'cpmCents' || k === 'bidCents') {
          ad[k] = Math.max(0, Math.floor(Number(req.body[k]) || 0));
        } else if (k === 'targeting') {
          const t = req.body[k];
          ad[k] = t && typeof t === 'object' && !Array.isArray(t) ? t : {};
        } else {
          ad[k] = req.body[k];
        }
      }
    }
    await ad.save();
    return reply.send({ ok: true, ad: ad.toObject() });
  });

  /* ── Delete ad ── */
  app.delete('/ads/:adId', async (req, reply) => {
    if (!validateId(req.params.adId, reply)) return;
    const user = await requireAuth(req, reply);
    if (!user) return;
    const ad = await db.Ad.findOne({ _id: req.params.adId, creatorId: user._id });
    if (!ad) return reply.status(404).send({ error: 'NOT_FOUND' });
    await ad.deleteOne();
    return reply.send({ ok: true });
  });

  /* ── Public: get ads for a placement ── */
  app.get('/ads/feed', async (req, reply) => {
    const { placement = 'feed', limit = 3, adSurface } = req.query ?? {};
    const userRegion = req.region?.user_country || req.region?.user_compliance_zone || req.query?.region;
    const ads = await adService.queryActiveAds({
      placement,
      adSurface: adSurface != null && String(adSurface).trim() !== '' ? String(adSurface) : null,
      region: userRegion || null,
      limit: Math.min(Number(limit), 10),
    });
    return reply.send({ ads });
  });

  /* ── Mobile targeting endpoint ── */
  app.post('/ads/targeting', async (req, reply) => {
    const user = await authUser(req).catch(() => null);
    const { placement = 'feed', adSurface, limit = 5, region, interests = [], age, excludeAdIds = [] } = req.body ?? {};
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
    const now = new Date();

    const userProfile = user ? await db.Profile.findOne({ userId: user._id }).lean().catch(() => null) : null;
    const inferredRegion = String(
      region ||
      req.region?.user_country ||
      req.region?.user_compliance_zone ||
      userProfile?.meta?.country ||
      ''
    ).toUpperCase().trim();
    const inferredAge = Number(age || userProfile?.meta?.age || 0);
    const inferredInterests = [
      ...new Set([
        ...(Array.isArray(interests) ? interests : []),
        ...(Array.isArray(userProfile?.meta?.interests) ? userProfile.meta.interests : []),
      ].map((x) => String(x || '').toLowerCase().trim()).filter(Boolean)),
    ];

    const campaigns = await db.Campaign.find({
      status: 'active',
      $and: [
        { $or: [{ startsAt: { $lte: now } }, { startsAt: null }] },
        { $or: [{ endsAt: { $gt: now } }, { endsAt: null }] },
      ],
    }).lean();
    if (!campaigns.length) return reply.send({ ads: [], targeting: { region: inferredRegion || null, interests: inferredInterests } });

    const campaignsById = Object.fromEntries(campaigns.map((c) => [String(c._id), c]));
    const excludedSet = new Set((Array.isArray(excludeAdIds) ? excludeAdIds : []).map((id) => String(id)));
    const ads = await db.Ad.find({
      campaignId: { $in: campaigns.map((c) => c._id) },
      placement,
      status: 'active',
      ...(adSurface ? { adSurface: String(adSurface) } : {}),
      ...(inferredRegion ? { $or: [{ target_regions: { $size: 0 } }, { target_regions: inferredRegion }] } : {}),
    })
      .limit(200)
      .lean();

    const targeted = ads.filter((ad) => {
      if (excludedSet.has(String(ad._id))) return false;
      const campaign = campaignsById[String(ad.campaignId)];
      if (!campaign) return false;
      const ta = campaign.targetAudience || {};
      const countries = Array.isArray(ta.countries) ? ta.countries.map((c) => String(c).toUpperCase()) : [];
      if (countries.length && inferredRegion && !countries.includes(inferredRegion)) return false;
      const categories = Array.isArray(ta.categories) ? ta.categories.map((c) => String(c).toLowerCase()) : [];
      if (categories.length && inferredInterests.length) {
        const overlap = inferredInterests.some((i) => categories.includes(i));
        if (!overlap) return false;
      }
      if (ta.ageRange && typeof ta.ageRange === 'object' && Number.isFinite(inferredAge) && inferredAge > 0) {
        const min = Number(ta.ageRange.min ?? 0);
        const max = Number(ta.ageRange.max ?? 200);
        if (inferredAge < min || inferredAge > max) return false;
      }
      return true;
    }).slice(0, safeLimit);

    return reply.send({
      ok: true,
      ads: targeted,
      targeting: {
        region: inferredRegion || null,
        interests: inferredInterests,
        age: Number.isFinite(inferredAge) && inferredAge > 0 ? inferredAge : null,
      },
    });
  });

  /* ── Record impression ── */
  app.post('/ads/:adId/impression', async (req, reply) => {
    if (!validateId(req.params.adId, reply)) return;
    db.Ad.updateOne({ _id: req.params.adId }, { $inc: { impressions: 1 } })
      .catch((e) => req.log.warn({ e, adId: req.params.adId }, 'impression $inc failed'));
    db.AdImpression.create({ adId: req.params.adId, meta: { ip: req.ip } })
      .catch((e) => req.log.warn({ e, adId: req.params.adId }, 'AdImpression.create failed'));
    return reply.send({ ok: true });
  });

  /* ── Record click ── */
  app.post('/ads/:adId/click', async (req, reply) => {
    if (!validateId(req.params.adId, reply)) return;
    const ad = await db.Ad.findById(req.params.adId).lean();
    if (!ad) return reply.status(404).send({ error: 'NOT_FOUND' });
    const cost = ad.costPerClick || 0;
    await db.Ad.updateOne({ _id: ad._id }, { $inc: { clicks: 1 } });
    await db.Campaign.updateOne({ _id: ad.campaignId }, { $inc: { clicks: 1, spentCents: cost } });
    // Write ledger entry for the spend so financial reports stay accurate
    if (cost > 0) {
      appendEntry({
        type:        'debit',
        actorId:     ad.creatorId,
        amountCents: -cost,
        refType:     'ad_click',
        refId:       String(ad._id),
        meta:        { source: 'ad_click', adId: String(ad._id), campaignId: String(ad.campaignId) },
      }).catch((err) => req.log.warn({ err, adId: String(ad._id) }, 'Failed to write ad_click ledger entry'));
    }
    return reply.send({ ok: true, ctaUrl: ad.ctaUrl });
  });

  /* ── Admin: list all campaigns ── */
  app.get('/ads/admin/all', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { status, limit = 50, offset = 0 } = req.query ?? {};
    const query = {};
    if (status) query.status = status;
    const [campaigns, total] = await Promise.all([
      db.Campaign.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.Campaign.countDocuments(query),
    ]);
    return reply.send({ campaigns, total });
  });

  /* ── Admin: approve campaign (set active) ── */
  app.post('/ads/campaigns/:id/approve', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const campaign = await db.Campaign.findById(req.params.id);
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    campaign.status = 'active';
    await campaign.save();
    await db.Ad.updateMany({ campaignId: campaign._id, status: 'draft' }, { $set: { status: 'active' } });
    await writeAdminAuditLog({
      adminId:  admin._id,
      action:   'campaign_approved',
      targetId: campaign._id,
    });
    return reply.send({ ok: true });
  });

  /* ── Admin: pause campaign ── */
  app.post('/ads/campaigns/:id/pause', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const campaign = await db.Campaign.findById(req.params.id);
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    campaign.status = 'paused';
    await campaign.save();
    await db.Ad.updateMany({ campaignId: campaign._id }, { $set: { status: 'paused' } });
    await writeAdminAuditLog({
      adminId:  admin._id,
      action:   'campaign_paused',
      targetId: campaign._id,
    });
    return reply.send({ ok: true });
  });
}

module.exports = { adsRoutes };
