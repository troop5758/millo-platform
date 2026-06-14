/**
 * PPV Routes — advanced Pay-Per-View for live streaming.
 * https://milloapp.com
 */
const ppv = require('@millo/ppv');
const { validateId } = require('../lib/validateId');
const fraudService = require('../services/fraudService');

async function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

async function ppvRoutes(app) {
  app.addHook('preHandler', async (request, reply) => {
    request.user = await authUser(request);
  });

  /* ── PPV Content CRUD ── */
  app.post('/ppv/content', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const body = request.body || {};
    try {
      const content = await ppv.contentService.createContent(user._id, {
        title: body.title,
        description: body.description,
        contentType: body.contentType,
        mediaUrl: body.mediaUrl,
        thumbnailUrl: body.thumbnailUrl,
        basePriceCents: body.basePriceCents,
        subscriberDiscountPercent: body.subscriberDiscountPercent,
        regionOverrides: body.regionOverrides,
        scheduledRelease: body.scheduledRelease,
        aiPriceEnabled: body.aiPriceEnabled,
        streamId: body.streamId,
        meta: body.meta,
      });
      return reply.status(201).send({ ok: true, content });
    } catch (e) {
      if (e.message === 'TITLE_REQUIRED') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.get('/ppv/content', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const status = request.query?.status || 'all';
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const offset = Number(request.query?.offset) || 0;
    const result = await ppv.contentService.listContent(user._id, { status, limit, offset });
    return reply.send(result);
  });

  app.get('/ppv/content/:contentId', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const content = await ppv.contentService.getContent(request.params.contentId);
    if (!content) return reply.status(404).send({ error: 'CONTENT_NOT_FOUND' });
    return reply.send(content);
  });

  app.patch('/ppv/content/:contentId', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const content = await ppv.contentService.updateContent(user._id, request.params.contentId, request.body || {});
      return reply.send({ ok: true, content });
    } catch (e) {
      if (e.message === 'CONTENT_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      throw e;
    }
  });

  app.patch('/ppv/content/:contentId/price', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { basePriceCents } = request.body || {};
    try {
      const content = await ppv.contentService.updateContentPrice(user._id, request.params.contentId, basePriceCents);
      return reply.send({ ok: true, content });
    } catch (e) {
      if (e.message === 'CONTENT_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  /* ── Price ── */
  app.get('/ppv/stream/:streamId/price', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const country = request.query?.country || request.region?.user_country;
    const result = await ppv.pricingService.getStreamPrice(request.params.streamId, country);
    if (!result) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    return reply.send(result);
  });

  app.get('/ppv/content/:contentId/price', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const country = request.query?.country || request.region?.user_country;
    const result = await ppv.pricingService.getContentPrice(request.params.contentId, country);
    if (!result) return reply.status(404).send({ error: 'CONTENT_NOT_FOUND' });
    return reply.send(result);
  });

  app.get('/ppv/ai-optimization/status', async (_request, reply) => {
    return reply.send({ enabled: ppv.aiPriceOptimizationService.isEnabled() });
  });

  /* ── Check access ── */
  app.get('/ppv/stream/:streamId/access', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const has = await ppv.unlockService.hasAccess(user._id, request.params.streamId);
    return reply.send({ hasAccess: has });
  });

  /* ── Unlock (purchase) ── */
  app.post('/ppv/stream/:streamId/unlock', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const velocity = await fraudService.checkPpvVelocity(user._id);
    if (!velocity.allowed) {
      return reply.status(429).send({ error: 'PPV_VELOCITY_LIMIT', message: 'Too many unlock attempts. Please try again later.' });
    }
    try {
      const purchase = await ppv.unlockService.unlockStream(user._id, request.params.streamId);
      await fraudService.logPpvUnlock(user._id, purchase.amountCents, { refType: 'ppv_stream', refId: request.params.streamId });
      await ppv.analyticsService.recordPurchase(request.params.streamId, purchase.creatorId, purchase.amountCents);
      return reply.send({ ok: true, purchase });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'STREAM_NOT_PPV') return reply.status(400).send({ error: e.message });
      if (e.message === 'OWNER_CANNOT_PURCHASE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INSUFFICIENT_BALANCE') return reply.status(402).send({ error: e.message });
      throw e;
    }
  });

  /* ── Bundles ── */
  app.post('/ppv/bundles', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { name, title, description, streamIds, contentIds, priceCents, bundlePriceCents } = request.body || {};
    try {
      const bundle = await ppv.bundleService.createBundle(user._id, {
        name: name || title,
        title: title || name,
        description,
        streamIds,
        contentIds,
        priceCents: priceCents ?? bundlePriceCents,
        bundlePriceCents: bundlePriceCents ?? priceCents,
      });
      return reply.status(201).send({ ok: true, bundle });
    } catch (e) {
      if (e.message === 'TITLE_AND_CONTENT_REQUIRED') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_STREAMS') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_CONTENT') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.get('/ppv/bundles/:bundleId', async (request, reply) => {
    if (!validateId(request.params.bundleId, reply)) return;
    const bundle = await ppv.bundleService.getBundle(request.params.bundleId);
    if (!bundle) return reply.status(404).send({ error: 'BUNDLE_NOT_FOUND' });
    return reply.send(bundle);
  });

  app.get('/ppv/bundles', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const status = request.query?.status || 'active';
    const bundles = await ppv.bundleService.listBundles(user._id, status);
    return reply.send({ bundles });
  });

  app.post('/ppv/bundles/:bundleId/purchase', async (request, reply) => {
    if (!validateId(request.params.bundleId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const velocity = await fraudService.checkPpvVelocity(user._id);
    if (!velocity.allowed) {
      return reply.status(429).send({ error: 'PPV_VELOCITY_LIMIT', message: 'Too many unlock attempts. Please try again later.' });
    }
    try {
      const result = await ppv.bundleService.purchaseBundle(user._id, request.params.bundleId);
      await fraudService.logPpvUnlock(user._id, result.bundle?.bundlePriceCents ?? result.bundle?.priceCents ?? 0, { refType: 'ppv_bundle', refId: request.params.bundleId });
      return reply.send({ ok: true, ...result });
    } catch (e) {
      if (e.message === 'BUNDLE_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'BUNDLE_NOT_AVAILABLE') return reply.status(400).send({ error: e.message });
      if (e.message === 'BUNDLE_EMPTY') return reply.status(400).send({ error: e.message });
      if (e.message === 'OWNER_CANNOT_PURCHASE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INSUFFICIENT_BALANCE') return reply.status(402).send({ error: e.message });
      throw e;
    }
  });

  /* ── Messages ── */
  app.post('/ppv/stream/:streamId/messages', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const msg = await ppv.messageService.createMessage(user._id, request.params.streamId, request.body || {});
      return reply.status(201).send({ ok: true, message: msg });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      throw e;
    }
  });

  app.get('/ppv/stream/:streamId/messages', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const type = request.query?.type;
    const messages = await ppv.messageService.listMessages(request.params.streamId, type);
    return reply.send({ messages });
  });

  app.post('/ppv/messages/:messageId/send', async (request, reply) => {
    if (!validateId(request.params.messageId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { notifyUser } = require('../lib/notifyUser');
    try {
      const result = await ppv.messageService.sendMessage(request.params.messageId, notifyUser);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      if (e.message === 'MESSAGE_NOT_FOUND') return reply.status(404).send({ error: e.message });
      throw e;
    }
  });

  /* ── Mass PPV Messages (locked content to subscribers) ── */
  app.post('/ppv/mass-messages', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { messageText, contentId, priceCents, recipientIds } = request.body || {};
    if (!validateId(contentId, reply)) return;
    try {
      const msg = await ppv.massMessageService.createMassMessage(user._id, {
        messageText,
        contentId,
        priceCents,
        recipientIds,
      });
      return reply.status(201).send({ ok: true, message: msg });
    } catch (e) {
      if (e.message === 'CONTENT_AND_PRICE_REQUIRED') return reply.status(400).send({ error: e.message });
      if (e.message === 'CONTENT_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      throw e;
    }
  });

  app.post('/ppv/mass-messages/:messageId/send', async (request, reply) => {
    if (!validateId(request.params.messageId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { notifyUser } = require('../lib/notifyUser');
    try {
      const result = await ppv.massMessageService.sendMassMessage(request.params.messageId, notifyUser);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      if (e.message === 'MESSAGE_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'CONTENT_NOT_FOUND') return reply.status(404).send({ error: e.message });
      throw e;
    }
  });

  app.get('/ppv/mass-messages', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const messages = await ppv.massMessageService.listMassMessages(user._id, limit);
    return reply.send({ messages });
  });

  app.get('/ppv/mass-messages/received', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const messages = await ppv.massMessageService.listReceivedMessages(user._id, limit);
    return reply.send({ messages });
  });

  app.get('/ppv/content/:contentId/access', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const has = await ppv.massMessageService.hasContentAccess(user._id, request.params.contentId);
    return reply.send({ hasAccess: has });
  });

  app.post('/ppv/content/:contentId/unlock', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const velocity = await fraudService.checkPpvVelocity(user._id);
    if (!velocity.allowed) {
      return reply.status(429).send({ error: 'PPV_VELOCITY_LIMIT', message: 'Too many unlock attempts. Please try again later.' });
    }
    const { messageId, priceCents } = request.body || {};
    try {
      const purchase = await ppv.massMessageService.unlockContent(user._id, request.params.contentId, {
        messageId,
        priceCents,
      });
      await fraudService.logPpvUnlock(user._id, purchase.amountCents, { refType: 'ppv_content', refId: request.params.contentId });
      return reply.send({ ok: true, purchase });
    } catch (e) {
      if (e.message === 'CONTENT_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'OWNER_CANNOT_PURCHASE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      if (e.message === 'INSUFFICIENT_BALANCE') return reply.status(402).send({ error: e.message });
      throw e;
    }
  });

  /* ── Schedule ── */
  app.post('/ppv/stream/:streamId/schedule', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { priceCents } = request.body || {};
    try {
      const stream = await ppv.scheduleService.schedulePpv(user._id, request.params.streamId, priceCents);
      return reply.send({ ok: true, stream });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.patch('/ppv/stream/:streamId/price', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { priceCents } = request.body || {};
    try {
      const stream = await ppv.scheduleService.updatePpvPrice(user._id, request.params.streamId, priceCents);
      return reply.send({ ok: true, stream });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      if (e.message === 'STREAM_NOT_PPV') return reply.status(400).send({ error: e.message });
      if (e.message === 'INVALID_PRICE') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });

  app.get('/ppv/scheduled', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const streams = await ppv.scheduleService.getScheduledPpv(user._id);
    return reply.send({ streams });
  });

  /* ── Watermark ── */
  app.get('/ppv/stream/:streamId/watermark', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const config = await ppv.watermarkService.getWatermarkConfig(request.params.streamId);
    if (!config) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    return reply.send(config);
  });

  app.get('/ppv/stream/:streamId/watermark/token', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const sessionId = request.query?.sessionId || request.headers['x-session-id'] || request.requestId;
    const payload = ppv.watermarkService.getWatermarkPayload(user._id, sessionId);
    return reply.send(payload);
  });

  app.patch('/ppv/stream/:streamId/watermark', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const config = await ppv.watermarkService.setWatermarkConfig(user._id, request.params.streamId, request.body || {});
      return reply.send({ ok: true, watermark: config });
    } catch (e) {
      if (e.message === 'STREAM_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: e.message });
      throw e;
    }
  });

  /* ── Analytics ── */
  app.get('/ppv/stream/:streamId/analytics', async (request, reply) => {
    if (!validateId(request.params.streamId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const db = require('@millo/database');
    const stream = await db.LiveStream.findById(request.params.streamId).lean();
    if (!stream) return reply.status(404).send({ error: 'STREAM_NOT_FOUND' });
    if (stream.userId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { startDate, endDate } = request.query || {};
    const result = await ppv.analyticsService.getStreamAnalytics(request.params.streamId, startDate, endDate);
    return reply.send(result);
  });

  app.get('/ppv/content/:contentId/analytics', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const db = require('@millo/database');
    const content = await db.PpvContent.findById(request.params.contentId).lean();
    if (!content) return reply.status(404).send({ error: 'CONTENT_NOT_FOUND' });
    if (content.creatorId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { startDate, endDate } = request.query || {};
    const result = await ppv.analyticsService.getContentAnalytics(request.params.contentId, startDate, endDate);
    return reply.send(result);
  });

  app.post('/ppv/content/:contentId/view', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const db = require('@millo/database');
    const content = await db.PpvContent.findById(request.params.contentId).lean();
    if (!content) return reply.status(404).send({ error: 'CONTENT_NOT_FOUND' });
    await ppv.analyticsService.recordContentView(request.params.contentId, content.creatorId);
    return reply.send({ ok: true });
  });

  app.post('/ppv/content/:contentId/click', async (request, reply) => {
    if (!validateId(request.params.contentId, reply)) return;
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const db = require('@millo/database');
    const content = await db.PpvContent.findById(request.params.contentId).lean();
    if (!content) return reply.status(404).send({ error: 'CONTENT_NOT_FOUND' });
    await ppv.analyticsService.recordContentClick(request.params.contentId, content.creatorId);
    return reply.send({ ok: true });
  });

  app.get('/ppv/analytics', async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { startDate, endDate, type } = request.query || {};
    const streamResult = await ppv.analyticsService.getCreatorPpvAnalytics(user._id, startDate, endDate);
    const contentResult = await ppv.analyticsService.getCreatorContentAnalytics(user._id, startDate, endDate);
    return reply.send({
      streams: streamResult,
      content: contentResult,
      combined: {
        purchaseCount: streamResult.summary.purchaseCount + contentResult.summary.purchases,
        revenueCents: streamResult.summary.revenueCents + contentResult.summary.revenueCents,
        conversionRate: contentResult.summary.conversionRate,
      },
    });
  });
}

module.exports = { ppvRoutes };
