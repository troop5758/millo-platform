'use strict';
/**
 * Phase 6 — Global Marketing Automation. Phase 13 — Platform campaigns, attribution.
 * Referrals, Creator Accelerator, Retention.
 * https://milloapp.com
 */
const db = require('@millo/database');
const dashboards = require('@millo/dashboards');
const referralService = require('../services/referralService');
const creatorAcceleratorService = require('../services/creatorAcceleratorService');
const retentionService = require('../services/retentionService');
const marketingCampaignService = require('../services/marketingCampaignService');
const { resolveSession } = require('./auth');
const { validateId } = require('../lib/validateId');

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function marketingRoutes(app) {

  /* ── Referral: get invite code ── */
  app.get('/marketing/referral/code', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const inviteCode = await referralService.getOrCreateInviteCode(user._id);
    const stats = await referralService.getReferralStats(user._id);
    return reply.send({ inviteCode, ...stats });
  });

  /* ── Referral: register (new user signs up with code) ── */
  app.post('/marketing/referral/register', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { referrerId, inviteCode } = request.body ?? {};
    if (!referrerId && !inviteCode) return reply.status(400).send({ error: 'REFERRER_OR_CODE_REQUIRED' });
    if (referrerId && String(referrerId) === String(user._id)) return reply.status(400).send({ error: 'CANNOT_REFER_SELF' });
    try {
      const ref = await referralService.registerReferral(referrerId, user._id, inviteCode);
      return reply.status(201).send({ ok: true, referral: ref.toObject() });
    } catch (err) {
      if (err.message === 'INVALID_INVITE_CODE') return reply.status(400).send({ error: err.message });
      throw err;
    }
  });

  /* ── Referral: qualify (call when new user meets criteria) ── */
  app.post('/marketing/referral/qualify', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const ref = await referralService.qualifyReferral(user._id);
    if (!ref) return reply.send({ ok: false, qualified: false });
    return reply.send({ ok: true, qualified: true, referral: ref.toObject() });
  });

  /* ── Referral: reward (call after qualify) ── */
  app.post('/marketing/referral/reward', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const ref = await referralService.rewardReferral(user._id);
    if (!ref) return reply.send({ ok: false, rewarded: false });
    return reply.send({ ok: true, rewarded: true, referral: ref.toObject() });
  });

  /* ── Creator Accelerator: featured creators ── */
  app.get('/marketing/accelerator/featured', async (request, reply) => {
    const limit = Math.min(Number(request.query?.limit) || 10, 50);
    const creators = await creatorAcceleratorService.getFeaturedCreators(limit);
    const userIds = creators.map((c) => c.creatorId?._id || c.creatorId).filter(Boolean);
    const profiles = await db.Profile.find({ userId: { $in: userIds } }).lean();
    const profMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const result = creators.map((c) => {
      const uid = c.creatorId?._id || c.creatorId;
      return {
        creatorId: uid,
        featured: c.featured,
        algorithmBoost: c.algorithmBoost,
        displayName: profMap[String(uid)]?.displayName,
        avatarUrl: profMap[String(uid)]?.avatarUrl,
      };
    });
    return reply.send({ creators: result });
  });

  /* ── Creator Accelerator: my status (creator) ── */
  app.get('/marketing/accelerator/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const acc = await creatorAcceleratorService.getOrCreate(user._id);
    return reply.send({ accelerator: acc.toObject() });
  });

  /* ── Admin: set featured / algorithm boost ── */
  app.post('/marketing/accelerator/:creatorId/featured', async (request, reply) => {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.creatorId, reply)) return;
    const { featured } = request.body ?? {};
    const acc = await creatorAcceleratorService.setFeatured(request.params.creatorId, featured);
    return reply.send({ ok: true, accelerator: acc.toObject() });
  });

  app.post('/marketing/accelerator/:creatorId/boost', async (request, reply) => {
    const admin = await authUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.creatorId, reply)) return;
    const { boost } = request.body ?? {};
    const acc = await creatorAcceleratorService.setAlgorithmBoost(request.params.creatorId, boost);
    return reply.send({ ok: true, accelerator: acc.toObject() });
  });

  /* ── Retention: daily streak (record activity) ── */
  app.post('/marketing/streak/record', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const result = await retentionService.recordDailyActivity(user._id);
    return reply.send({ ok: true, ...result });
  });

  /* ── Retention: my streak ── */
  app.get('/marketing/streak/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const streak = await db.UserStreak.findOne({ userId: user._id }).lean();
    return reply.send({
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
      lastActiveAt: streak?.lastActiveAt,
    });
  });

  /* ── Retention: my badges ── */
  app.get('/marketing/badges/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const badges = await retentionService.getUserBadges(user._id);
    return reply.send({ badges });
  });

  /* ── Retention: leaderboards ── */
  app.get('/marketing/leaderboard/:type', async (request, reply) => {
    const type = request.params.type;
    const valid = ['gifts', 'streaks'];
    if (!valid.includes(type)) return reply.status(400).send({ error: 'INVALID_TYPE', valid });
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const leaderboard = await retentionService.getLeaderboard(type, limit);
    return reply.send({ leaderboard, type });
  });

  /* ── Top streams (TikTok-style: gifts + viewers + chat) ── */
  app.get('/marketing/leaderboard/streams', async (request, reply) => {
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const window = request.query?.window || 'live';
    const streams = await retentionService.getTopStreams(limit, window);
    return reply.send({ leaderboard: streams, type: 'streams' });
  });

  /* ── Top supporters for a creator ── */
  app.get('/marketing/leaderboard/supporters', async (request, reply) => {
    const creatorId = request.query?.creatorId;
    if (!creatorId) return reply.status(400).send({ error: 'CREATOR_ID_REQUIRED', message: 'creatorId query param required' });
    const { validateId } = require('../lib/validateId');
    if (!validateId(creatorId, reply)) return;
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const supporters = await retentionService.getTopSupporters(creatorId, limit);
    return reply.send({ leaderboard: supporters, type: 'supporters', creatorId });
  });

  /* ── Retention: creator rankings ── */
  app.get('/marketing/leaderboard/creators', async (request, reply) => {
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const rankings = await retentionService.getCreatorRankings(limit);
    return reply.send({ rankings });
  });

  /* ── Phase 13: Platform marketing campaigns ── */

  /* Active campaigns for user's region (public — for localized offers) */
  app.get('/marketing/campaigns/active', async (request, reply) => {
    const regionCode = request.region?.user_compliance_zone || request.query?.region || 'US';
    const campaigns = await marketingCampaignService.getActiveCampaignsForRegion(regionCode);
    return reply.send({ campaigns });
  });

  /* Record attribution (call on signup with utm params) */
  app.post('/marketing/attribution', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { utmSource, utmMedium, utmCampaign, affiliateCode } = request.body ?? {};
    try {
      const attr = await marketingCampaignService.recordAttribution(user._id, {
        utmSource,
        utmMedium,
        utmCampaign,
        affiliateCode,
        meta: { ip: request.ip, userAgent: request.headers['user-agent'] },
      });
      return reply.send({ ok: true, attribution: attr?.toObject?.() || attr });
    } catch (err) {
      request.log.warn({ err, userId: String(user._id) }, 'Attribution record failed');
      return reply.status(500).send({ error: 'ATTRIBUTION_FAILED' });
    }
  });

  /* Admin: list platform campaigns */
  app.get('/marketing/campaigns', async (request, reply) => {
    const user = await authUser(request);
    if (!user || !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { region, status, limit = 20, offset = 0 } = request.query ?? {};
    const filter = {};
    if (region) filter.targetRegions = (region || '').toUpperCase();
    if (status) filter.status = status;
    const [campaigns, total] = await Promise.all([
      db.MarketingCampaign.find(filter).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 50)).lean(),
      db.MarketingCampaign.countDocuments(filter),
    ]);
    return reply.send({ campaigns, total });
  });

  /* Admin: create platform campaign */
  app.post('/marketing/campaigns', async (request, reply) => {
    const user = await authUser(request);
    if (!user || !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const body = request.body ?? {};
    const { name, channel, campaignType, targetRegions, budgetCents, startsAt, endsAt, utmSource, utmMedium, utmCampaign, affiliateCode } = body;
    if (!name?.trim()) return reply.status(400).send({ error: 'NAME_REQUIRED' });
    if (!['tiktok', 'youtube', 'instagram', 'influencer', 'affiliate'].includes(channel)) {
      return reply.status(400).send({ error: 'INVALID_CHANNEL', valid: ['tiktok', 'youtube', 'instagram', 'influencer', 'affiliate'] });
    }
    const campaign = await db.MarketingCampaign.create({
      name: name.trim(),
      channel,
      campaignType: ['pix_bonus', 'creator_monetization', 'business_tools', 'influencer_partnership', 'generic'].includes(campaignType) ? campaignType : 'generic',
      targetRegions: Array.isArray(targetRegions) ? targetRegions.map((r) => String(r).toUpperCase()) : [],
      budgetCents: Number(budgetCents) || 0,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      utmSource: utmSource?.trim() || null,
      utmMedium: utmMedium?.trim() || null,
      utmCampaign: utmCampaign?.trim() || null,
      affiliateCode: affiliateCode?.trim() || null,
    });
    return reply.status(201).send({ ok: true, campaign: campaign.toObject() });
  });

  /* Admin: update campaign */
  app.put('/marketing/campaigns/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const campaign = await db.MarketingCampaign.findById(request.params.id);
    if (!campaign) return reply.status(404).send({ error: 'NOT_FOUND' });
    const allowed = ['name', 'campaignType', 'targetRegions', 'status', 'budgetCents', 'dailyCapCents', 'startsAt', 'endsAt', 'utmSource', 'utmMedium', 'utmCampaign', 'affiliateCode'];
    for (const k of allowed) {
      if (request.body?.[k] !== undefined) campaign[k] = request.body[k];
    }
    await campaign.save();
    return reply.send({ ok: true, campaign: campaign.toObject() });
  });
}

module.exports = { marketingRoutes };
