'use strict';
/**
 * Moderation routes — reports + creator applications.
 *
 * POST /moderation/report               — submit a report (auth)
 * GET  /moderation/reports              — admin: list reports
 * POST /moderation/reports/:id/action   — admin: resolve / dismiss / review
 *
 * POST /creators/apply                  — submit creator application (auth)
 * GET  /creators/application/me         — get own application status
 * GET  /creators/applications           — admin: list pending applications
 * POST /creators/applications/:id/approve — admin: approve
 * POST /creators/applications/:id/reject  — admin: reject
 *
 * GET  /admin/moderation/shadow-mode      — admin: get AI shadow mode (PlatformSettings ai_shadow_mode)
 * PATCH /admin/moderation/shadow-mode    — admin: set AI shadow mode (body: { enabled } or { value })
 *
 * Admin dashboard (moderation UI):
 * GET  /admin/moderation/flags            — pending moderation queue + open reports
 * POST /admin/moderation/flags/:id/action — body: { source: 'moderation_queue'|'report', action: 'approve'|'reject', note? }
 * GET  /admin/users/:id/trust             — trust score + graph edge count
 * POST /admin/ban                         — body: { userId, reason? }; permanent ban (audit via enforcement engine)
 *
 * https://milloapp.com
 */
const mongoose = require('mongoose');
const db = require('@millo/database');
const { PlatformSettings } = require('@millo/database');
const { resolveSession } = require('./auth');
const { writeAdminAuditLog, writeAuditLog } = require('../services/auditLog');
const { notifyUser } = require('../lib/notifyUser');
const { validateId } = require('../lib/validateId');
const moderationService = require('../services/moderationService');
const aiModeration = require('../services/aiModeration.service');
const engagementAuthenticityService = require('../services/engagementAuthenticityService');
const kafka = require('../services/kafkaEventBus');
const trustService = require('../services/trust.service');
const enforcementEngine = require('../services/enforcementEngine');

const REPORT_RATE_LIMIT = {
  max: 10,
  timeWindow: '10 minutes',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many reports submitted — please wait before submitting another' }),
};

const APPLY_RATE_LIMIT = {
  max: 3,
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many applications submitted — please wait before trying again' }),
};

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function requireAdmin(request, reply) {
  const user = await authUser(request);
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return null; }
  if (user.role !== 'admin') { reply.status(403).send({ error: 'FORBIDDEN' }); return null; }
  return user;
}

async function moderationRoutes(app) {

  /* ── AI moderation check (admin or internal) ── */
  app.post('/moderation/ai/check', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin' && user.role !== 'mod') return reply.status(403).send({ error: 'FORBIDDEN' });

    const { text } = request.body ?? {};
    if (!text?.trim()) return reply.status(400).send({ error: 'text required' });

    try {
      const result = await aiModeration.moderate(text.trim());
      return reply.send(result);
    } catch (e) {
      if (e.message === 'AI_MODERATION_DISABLED') {
        return reply.status(503).send({ error: 'AI_MODERATION_DISABLED', message: 'AI moderation is not enabled.' });
      }
      request.log.warn({ err: e }, 'AI moderation error');
      return reply.status(502).send({ error: 'AI_MODERATION_ERROR', message: e.message });
    }
  });

  app.get('/moderation/ai/status', async (_request, reply) => {
    return reply.send({ enabled: aiModeration.isEnabled(), providers: aiModeration.isProviderEnabled?.() || {} });
  });

  /* ── Admin: AI shadow mode toggle (stored in PlatformSettings key ai_shadow_mode) ── */
  const AI_SHADOW_MODE_KEY = 'ai_shadow_mode';
  app.get('/admin/moderation/shadow-mode', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    try {
      const doc = await PlatformSettings.findOne({ key: AI_SHADOW_MODE_KEY }).lean();
      const value = doc?.value === true;
      return reply.send({ ai_shadow_mode: value });
    } catch (e) {
      request.log.warn({ err: e }, 'GET shadow-mode');
      return reply.status(500).send({ error: 'FAILED', message: e.message });
    }
  });
  app.patch('/admin/moderation/shadow-mode', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const body = request.body ?? {};
    const value = body.enabled === true || body.value === true;
    try {
      await PlatformSettings.findOneAndUpdate(
        { key: AI_SHADOW_MODE_KEY },
        { $set: { key: AI_SHADOW_MODE_KEY, value, updatedBy: String(user._id) } },
        { upsert: true, new: true }
      );
      await writeAdminAuditLog({
        adminId: user._id,
        action: 'ai_shadow_mode_toggle',
        meta: { ai_shadow_mode: value },
      });
      return reply.send({ ok: true, ai_shadow_mode: value });
    } catch (e) {
      request.log.warn({ err: e }, 'PATCH shadow-mode');
      return reply.status(500).send({ error: 'FAILED', message: e.message });
    }
  });

  /* ── Admin dashboard: flagged content (queue + user reports) ── */
  app.get('/admin/moderation/flags', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const q = request.query ?? {};
    const source = String(q.source || 'all');
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    const page = Math.max(1, Number(q.page) || 1);
    const skip = (page - 1) * limit;

    const wantQueue = source === 'all' || source === 'moderation_queue';
    const wantReports = source === 'all' || source === 'reports';
    const takeMerged = source === 'all' ? skip + limit : limit;

    const [queueItems, queueTotal, reportItems, reportTotal] = await Promise.all([
      wantQueue
        ? db.ModerationQueue.find({ status: { $in: ['pending', 'reviewing'] } })
          .sort({ createdAt: -1 })
          .skip(source === 'all' ? 0 : skip)
          .limit(source === 'all' ? takeMerged : limit)
          .lean()
        : Promise.resolve([]),
      wantQueue
        ? db.ModerationQueue.countDocuments({ status: { $in: ['pending', 'reviewing'] } })
        : Promise.resolve(0),
      wantReports
        ? db.Report.find({ status: { $in: ['open', 'reviewing'] } })
          .sort({ createdAt: -1 })
          .skip(source === 'all' ? 0 : skip)
          .limit(source === 'all' ? takeMerged : limit)
          .lean()
        : Promise.resolve([]),
      wantReports
        ? db.Report.countDocuments({ status: { $in: ['open', 'reviewing'] } })
        : Promise.resolve(0),
    ]);

    const flags = [];
    if (wantQueue) {
      for (const row of queueItems) {
        flags.push({ flagType: 'moderation_queue', ...row });
      }
    }
    if (wantReports) {
      for (const row of reportItems) {
        flags.push({ flagType: 'report', ...row });
      }
    }
    flags.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const paged = source === 'all' ? flags.slice(skip, skip + limit) : flags;
    const total = source === 'all' ? queueTotal + reportTotal : source === 'moderation_queue' ? queueTotal : reportTotal;

    return reply.send({
      items: paged,
      total,
      page,
      limit,
      source,
    });
  });

  app.post('/admin/moderation/flags/:id/action', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { source, action, note } = request.body ?? {};
    if (!['moderation_queue', 'report'].includes(source)) {
      return reply.status(400).send({ error: 'INVALID_SOURCE', message: 'source must be moderation_queue or report' });
    }
    if (!['approve', 'reject'].includes(action)) {
      return reply.status(400).send({ error: 'INVALID_ACTION', message: 'action must be approve or reject' });
    }
    const id = request.params.id;
    const noteStr = note != null ? String(note).slice(0, 500) : '';

    if (source === 'moderation_queue') {
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      const updated = await db.ModerationQueue.findOneAndUpdate(
        { _id: id, status: { $in: ['pending', 'reviewing'] } },
        {
          $set: {
            status: nextStatus,
            reviewedBy: admin._id,
            reviewedAt: new Date(),
            ...(noteStr ? { reviewNote: noteStr } : {}),
          },
        },
        { new: true }
      ).lean();
      if (!updated) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Queue item not found or already decided' });
      await writeAdminAuditLog({
        adminId: admin._id,
        action: `moderation_queue_${action}`,
        targetType: 'ModerationQueue',
        targetId: String(id),
        overrideReason: noteStr || null,
        meta: { status: nextStatus, contentId: updated.contentId, contentType: updated.contentType },
      });
      await writeAuditLog({
        action: action === 'approve' ? 'MODERATION_QUEUE_APPROVED' : 'MODERATION_QUEUE_REJECTED',
        userId: updated.uploaderId || undefined,
        adminId: admin._id,
        reason: noteStr || updated.reason || nextStatus,
        resourceType: 'ModerationQueue',
        resourceId: String(id),
        meta: { contentId: updated.contentId, contentType: updated.contentType, status: nextStatus },
      });
      return reply.send({ ok: true, item: updated });
    }

    const report = await db.Report.findById(id);
    if (!report || !['open', 'reviewing'].includes(report.status)) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Report not found or already closed' });
    }
    if (action === 'approve') {
      report.status = 'dismissed';
      report.resolution = noteStr || 'dismissed_by_moderator';
    } else {
      report.status = 'resolved';
      report.resolution = noteStr || 'substantiated';
    }
    report.resolvedBy = admin._id;
    await report.save();
    await writeAdminAuditLog({
      adminId: admin._id,
      action: `report_moderation_${action}`,
      targetType: 'Report',
      targetId: String(report._id),
      overrideReason: noteStr || null,
      meta: { targetType: report.targetType, targetId: String(report.targetId), reason: report.reason },
    });
    const subjectUserId =
      report.targetType === 'user' && mongoose.Types.ObjectId.isValid(String(report.targetId))
        ? report.targetId
        : undefined;
    await writeAuditLog({
      action: action === 'approve' ? 'REPORT_DISMISSED' : 'REPORT_RESOLVED',
      userId: subjectUserId,
      adminId: admin._id,
      reason: report.reason,
      resourceType: 'Report',
      resourceId: String(report._id),
      meta: { targetType: report.targetType, targetId: String(report.targetId), note: noteStr || undefined },
    });
    kafka.publish(kafka.TOPICS.MODERATION, {
      event: 'report.moderated',
      reportId: String(report._id),
      action,
      adminId: String(admin._id),
      targetType: report.targetType,
      targetId: String(report.targetId),
    }).catch(() => {});
    return reply.send({ ok: true, report: report.toObject() });
  });

  app.get('/admin/users/:id/trust', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const userId = request.params.id;
    const user = await db.User.findById(userId)
      .select('email emailVerified phoneVerified status shadowBanned riskLock flags createdAt')
      .lean();
    if (!user) return reply.status(404).send({ error: 'USER_NOT_FOUND' });

    const strikeDoc = await db.UserStrike.findOne({ userId }).select('strikeCount status strikes').lean();
    const strikes = Number(strikeDoc?.strikeCount) || 0;
    const fraudHints = Number(user.riskLock ? 1 : 0) + (user.flags?.fraudFlags != null ? Number(user.flags.fraudFlags) : 0);

    const trustScore = trustService.calculateTrust({
      strikes,
      verified: !!(user.emailVerified || user.phoneVerified),
      fraudFlags: Math.min(10, fraudHints),
    });

    const graphEdgeCount = await db.TrustGraphLink.countDocuments({
      fromKind: trustService.NODE_KIND.USER,
      fromId: String(userId),
    });

    return reply.send({
      userId: String(userId),
      trustScore,
      breakdown: {
        strikes,
        strikeStatus: strikeDoc?.status || null,
        emailVerified: !!user.emailVerified,
        phoneVerified: !!user.phoneVerified,
        accountStatus: user.status,
        shadowBanned: !!user.shadowBanned,
        riskLock: !!user.riskLock,
        graphEdgeCount,
      },
    });
  });

  app.post('/admin/ban', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { userId, reason } = request.body ?? {};
    if (userId == null || userId === '') {
      return reply.status(400).send({ error: 'USER_ID_REQUIRED', message: 'userId required' });
    }
    if (!validateId(String(userId), reply)) return;
    if (String(userId) === String(admin._id)) {
      return reply.status(400).send({ error: 'CANNOT_BAN_SELF' });
    }
    const target = await db.User.findById(userId).select('_id status').lean();
    if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    const reasonStr = reason != null ? String(reason).slice(0, 500) : 'Admin ban';
    await enforcementEngine.banUser(userId, {
      reason: reasonStr,
      performedBy: admin._id,
      adminId: admin._id,
    });
    return reply.send({ ok: true, userId: String(userId), banned: true });
  });

  /* ── Moderation queue (human review when AI disabled — shadow moderation) ── */
  app.get('/moderation/queue', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { status = 'pending', limit = 50, page = 1 } = request.query ?? {};
    const query = status === 'all' ? {} : { status };
    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Math.max(1, Number(limit)));
    const items = await db.ModerationQueue.find(query).sort({ createdAt: -1 }).skip(skip).limit(Math.min(100, Math.max(1, Number(limit)))).lean();
    const total = await db.ModerationQueue.countDocuments(query);
    return reply.send({ items, total, page: Number(page), limit: Math.min(100, Math.max(1, Number(limit))) });
  });

  app.patch('/moderation/queue/:id', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { id } = request.params;
    const { status, reviewNote } = request.body ?? {};
    if (!['approved', 'rejected', 'reviewing'].includes(status)) return reply.status(400).send({ error: 'status must be approved, rejected, or reviewing' });
    const updated = await db.ModerationQueue.findOneAndUpdate(
      { _id: id },
      { $set: { status, reviewedBy: user._id, reviewedAt: new Date(), ...(reviewNote != null ? { reviewNote: String(reviewNote).slice(0, 500) } : {}) } },
      { new: true }
    ).lean();
    if (!updated) return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send(updated);
  });

  /* ── AI moderation pipeline: upload -> scan -> decision ── */
  app.post('/moderation/ai/scan', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin' && user.role !== 'mod') return reply.status(403).send({ error: 'FORBIDDEN' });

    const { text, mediaUrl, mediaType, contentId, contentType } = request.body ?? {};
    if (!text && !mediaUrl) {
      return reply.status(400).send({ error: 'TEXT_OR_MEDIA_REQUIRED' });
    }

    try {
      const result = await aiModeration.moderateUpload({
        text,
        mediaUrl,
        mediaType,
        contentId,
        contentType,
      });
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'AI moderation pipeline error');
      return reply.status(502).send({ error: 'AI_MODERATION_PIPELINE_ERROR', message: e.message });
    }
  });

  /* ── Submit a report ── */
  app.post('/moderation/report', { config: { rateLimit: REPORT_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { targetType, targetId, reason, description = '' } = request.body ?? {};
    if (!targetType || !targetId || !reason) {
      return reply.status(400).send({ error: 'targetType, targetId, reason required' });
    }
    const validReasons = ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'];
    if (!validReasons.includes(reason)) {
      return reply.status(400).send({ error: 'INVALID_REASON', valid: validReasons });
    }
    if (description && description.length > 2000) return reply.status(400).send({ error: 'DESCRIPTION_TOO_LONG', message: 'Report description must be 2,000 characters or fewer' });
    const existing = await db.Report.findOne({ reporterId: user._id, targetId });
    if (existing) return reply.status(409).send({ error: 'ALREADY_REPORTED' });
    let report;
    try {
      report = await db.Report.create({ reporterId: user._id, targetType, targetId, reason, description });
    } catch (err) {
      request.log.error({ err, userId: String(user._id), targetId }, 'Failed to create report');
      return reply.status(500).send({ error: 'CREATE_FAILED', message: 'Failed to submit report' });
    }
    kafka.publish(kafka.TOPICS.MODERATION, {
      event: 'report.created',
      reportId: String(report._id),
      reporterId: String(user._id),
      targetType,
      targetId: String(targetId),
      reason,
    }).catch(() => {});
    return reply.status(201).send({ ok: true, reportId: report._id });
  });

  /* ── Admin: list reports ── */
  app.get('/moderation/reports', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { status = 'open', limit = 50, offset = 0, targetType } = request.query ?? {};
    const query = {};
    if (status !== 'all') query.status = status;
    if (targetType)       query.targetType = targetType;
    const [reports, total] = await Promise.all([
      db.Report.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.Report.countDocuments(query),
    ]);
    // Attach reporter profiles
    const ids = [...new Set(reports.map((r) => String(r.reporterId)))];
    const profiles = await db.Profile.find({ userId: { $in: ids } }).lean();
    const pm = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const enriched = reports.map((r) => ({ ...r, reporter: pm[String(r.reporterId)] || null }));
    return reply.send({ reports: enriched, total });
  });

  /* ── Admin: action on a report ── */
  app.post('/moderation/reports/:id/action', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { action, resolution = '' } = request.body ?? {};
    if (!['resolve', 'dismiss', 'reviewing'].includes(action)) {
      return reply.status(400).send({ error: 'action must be resolve|dismiss|reviewing' });
    }
    const report = await db.Report.findById(request.params.id);
    if (!report) return reply.status(404).send({ error: 'NOT_FOUND' });
    report.status     = action === 'reviewing' ? 'reviewing' : action === 'resolve' ? 'resolved' : 'dismissed';
    report.resolvedBy = admin._id;
    report.resolution = resolution;
    await report.save();
    kafka.publish(kafka.TOPICS.MODERATION, {
      event: 'report.action',
      reportId: String(report._id),
      action,
      adminId: String(admin._id),
      targetType: report.targetType,
      targetId: String(report.targetId),
    }).catch(() => {});
    await writeAdminAuditLog({ adminId: admin._id, action: `report_${action}`, targetId: report._id });
    return reply.send({ ok: true, report: report.toObject() });
  });

  /* ── Phase 14: Admin: add strike from report, resolve ── */
  app.post('/moderation/reports/:id/strike', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const report = await db.Report.findById(request.params.id);
    if (!report) return reply.status(404).send({ error: 'NOT_FOUND' });
    const userId = await moderationService.resolveTargetToUserId(report.targetType, report.targetId);
    if (!userId) return reply.status(400).send({ error: 'TARGET_USER_UNKNOWN', message: 'Could not resolve report target to user' });
    const strike = await moderationService.addStrike(userId, {
      reason: report.reason,
      targetType: report.targetType,
      targetId: report.targetId,
      reportId: report._id,
      moderatorId: admin._id,
    });
    report.status = 'resolved';
    report.resolvedBy = admin._id;
    report.resolution = 'Strike issued';
    await report.save();
    await db.ModerationLog.create({
      moderatorId: admin._id,
      targetType: 'user',
      targetId: String(userId),
      action: 'strike_added',
      meta: { reportId: String(report._id), reason: report.reason, strikeCount: strike.strikeCount },
    }).catch(() => {});
    await writeAdminAuditLog({ adminId: admin._id, action: 'report_strike', targetId: report._id, meta: { userId: String(userId) } });
    return reply.send({ ok: true, report: report.toObject(), strike: strike.toObject() });
  });

  /* ── Phase 14: Admin: get user strikes ── */
  app.get('/moderation/strikes/:userId', async (request, reply) => {
    if (!validateId(request.params.userId, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const status = await moderationService.getUserModerationStatus(request.params.userId);
    const record = await db.UserStrike.findOne({ userId: request.params.userId }).lean();
    return reply.send({ status, strikes: record?.strikes || [] });
  });

  /* ── Creator application: apply ── */
  app.post('/creators/apply', { config: { rateLimit: APPLY_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.creatorStatus && user.creatorStatus !== 'none') {
      return reply.status(409).send({ error: 'APPLICATION_EXISTS', status: user.creatorStatus });
    }
    const { displayName, bio, category, socialLinks, sampleContent } = request.body ?? {};
    if (displayName && displayName.length > 100) return reply.status(400).send({ error: 'DISPLAY_NAME_TOO_LONG', message: 'Display name must be 100 characters or fewer' });
    if (bio         && bio.length         > 1000) return reply.status(400).send({ error: 'BIO_TOO_LONG',          message: 'Bio must be 1,000 characters or fewer' });
    if (sampleContent && !Array.isArray(sampleContent)) return reply.status(400).send({ error: 'INVALID_SAMPLE_CONTENT', message: 'sampleContent must be an array' });
    let app_;
    try {
      app_ = await db.CreatorApplication.findOneAndUpdate(
        { userId: user._id },
        { $set: { displayName, bio, category, socialLinks, sampleContent, status: 'pending' } },
        { upsert: true, new: true }
      );
      await db.User.updateOne({ _id: user._id }, { $set: { creatorStatus: 'pending' } });
    } catch (err) {
      request.log.error({ err, userId: String(user._id) }, 'Failed to create/update creator application');
      return reply.status(500).send({ error: 'CREATE_FAILED', message: 'Failed to submit application' });
    }
    return reply.status(201).send({ ok: true, application: app_.toObject() });
  });

  /* ── Creator application: check own status ── */
  app.get('/creators/application/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const app_ = await db.CreatorApplication.findOne({ userId: user._id }).lean();
    return reply.send({ application: app_ || null, creatorStatus: user.creatorStatus || 'none' });
  });

  /* ── Creator upgrade (hybrid: $4.99/mo or $69 lifetime) ── */
  const creatorUpgradeService = require('../services/creatorUpgradeService');
  const verifiedCreatorService = require('../services/verifiedCreatorService');
  const trustedCreatorService = require('../services/trustedCreatorService');

  app.get('/creators/upgrade-options', async (_request, reply) => {
    const options = await creatorUpgradeService.getUpgradeOptions();
    return reply.send(options);
  });

  app.get('/creators/upgrade/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const access = await creatorUpgradeService.getCreatorAccess(user._id);
    const giftReceiverEligibility = require('../services/giftReceiverEligibility');
    const [giftEligibility, verificationStatus, trustedStatus] = await Promise.all([
      giftReceiverEligibility.getReceiverEligibilitySummary(user._id),
      verifiedCreatorService.getVerificationStatus(user._id),
      trustedCreatorService.getTrustedStatus(user._id),
    ]);
    return reply.send({
      creatorStatus: user.creatorStatus || 'none',
      role: user.role || 'user',
      upgrade: access,
      giftEligibility,
      verificationStatus,
      trustedStatus,
    });
  });

  app.get('/creators/verification-status', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const status = await verifiedCreatorService.getVerificationStatus(user._id);
    return reply.send(status);
  });

  app.get('/creators/trusted-status', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const status = await trustedCreatorService.getTrustedStatus(user._id);
    return reply.send(status);
  });

  app.post('/creators/upgrade', { config: { rateLimit: APPLY_RATE_LIMIT } }, async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.creatorStatus === 'approved') {
      return reply.send({ ok: true, alreadyCreator: true, message: 'You are already a creator.' });
    }
    const { type } = request.body || {};
    if (!['monthly', 'lifetime'].includes(type)) {
      return reply.status(400).send({ error: 'INVALID_TYPE', message: 'type must be "monthly" or "lifetime"' });
    }
    try {
      const result = await creatorUpgradeService.createCheckout(user._id, type, { email: user.email });
      return reply.send({
        ok: true,
        checkoutUrl: result.url,
        sessionId: result.sessionId,
        stub: result.stub || false,
      });
    } catch (err) {
      request.log.error({ err, userId: user._id }, 'Creator upgrade checkout failed');
      return reply.status(500).send({ error: err.message });
    }
  });

  /* ── Admin: list creator applications ── */
  app.get('/creators/applications', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { status = 'pending', limit = 50, offset = 0 } = request.query ?? {};
    const query = {};
    if (status !== 'all') query.status = status;
    const [apps, total] = await Promise.all([
      db.CreatorApplication.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.CreatorApplication.countDocuments(query),
    ]);
    // Attach profiles
    const ids = apps.map((a) => String(a.userId));
    const profiles = await db.Profile.find({ userId: { $in: ids } }).lean();
    const pm = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
    const enriched = apps.map((a) => ({ ...a, profile: pm[String(a.userId)] || null }));
    return reply.send({ applications: enriched, total });
  });

  /* ── Admin: approve creator ── */
  app.post('/creators/applications/:id/approve', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const application = await db.CreatorApplication.findById(request.params.id);
    if (!application) return reply.status(404).send({ error: 'NOT_FOUND' });
    application.status     = 'approved';
    application.reviewedBy = admin._id;
    application.reviewNote = request.body?.note || '';
    application.reviewedAt = new Date();
    await application.save();
    await db.User.updateOne({ _id: application.userId }, { $set: { creatorStatus: 'approved', role: 'creator' } });
    await db.Profile.updateOne(
      { userId: application.userId, 'badges.badgeId': { $ne: 'verified_creator' } },
      {
        $set: { creatorVerifiedAt: new Date() },
        $push: { badges: { badgeId: 'verified_creator', label: 'Verified Creator', icon: 'check' } },
      }
    ).catch((e) => request.log.warn({ e, userId: String(application.userId) }, 'Failed to set creatorVerifiedAt'));
    await notifyUser(application.userId, {
      type:  'creatorApproved',
      title: 'You\'re now a Millo Creator!',
      body:  'Your creator application has been approved. You can now go live and monetize.',
    });
    await writeAdminAuditLog({ adminId: admin._id, action: 'creator_approved', targetId: application._id });
    return reply.send({ ok: true });
  });

  /* ── Admin: reject creator ── */
  app.post('/creators/applications/:id/reject', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const application = await db.CreatorApplication.findById(request.params.id);
    if (!application) return reply.status(404).send({ error: 'NOT_FOUND' });
    application.status     = 'rejected';
    application.reviewedBy = admin._id;
    application.reviewNote = request.body?.note || 'Does not meet creator requirements.';
    application.reviewedAt = new Date();
    await application.save();
    await db.User.updateOne({ _id: application.userId }, { $set: { creatorStatus: 'rejected' } });
    await notifyUser(application.userId, {
      type:  'creatorRejected',
      title: 'Creator application update',
      body:  application.reviewNote,
    });
    await writeAdminAuditLog({ adminId: admin._id, action: 'creator_rejected', targetId: application._id });
    return reply.send({ ok: true });
  });

  /* ── Content Authenticity Score (CAS) — admin: score 0–100, band, eligibility ── */
  app.get('/moderation/content-authenticity/stream/:streamId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;
    try {
      const contentAuthenticityService = require('../services/contentAuthenticityService');
      const skipCache = request.query.refresh === 'true';
      const data = await contentAuthenticityService.getContentAuthenticityScore(request.params.streamId, 'stream', { skipCache });
      const score = data.score ?? 50;
      return reply.send({
        ...data,
        feedRankingEligible: contentAuthenticityService.feedRankingEligible(score),
        trendingEligible: contentAuthenticityService.trendingEligible(score),
        monetizationEligible: contentAuthenticityService.monetizationEligible(score),
        moderationAlert: contentAuthenticityService.moderationAlert(score),
      });
    } catch (e) {
      request.log.warn({ err: e }, 'Content authenticity error');
      return reply.status(500).send({ error: 'CONTENT_AUTHENTICITY_ERROR', message: e?.message });
    }
  });

  /* ── Engagement authenticity (admin): organic vs manipulated engagement ── */
  app.get('/moderation/engagement-authenticity/stream/:streamId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.streamId, reply)) return;
    try {
      const data = await engagementAuthenticityService.getStreamAuthenticity(request.params.streamId);
      return reply.send(data);
    } catch (e) {
      request.log.warn({ err: e }, 'Engagement authenticity error');
      return reply.status(500).send({ error: 'ENGAGEMENT_AUTHENTICITY_ERROR', message: e.message });
    }
  });
  app.get('/moderation/engagement-authenticity/creator/:creatorId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const data = await engagementAuthenticityService.getCreatorAuthenticity(request.params.creatorId);
      return reply.send(data);
    } catch (e) {
      request.log.warn({ err: e }, 'Engagement authenticity error');
      return reply.status(500).send({ error: 'ENGAGEMENT_AUTHENTICITY_ERROR', message: e.message });
    }
  });

  /* ── Trend manipulation detection (admin): hashtag burst, creator cluster, interaction ring, geo concentration ── */
  app.get('/moderation/trend-manipulation/alerts', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 20));
      const alerts = await db.FraudEvent.find({ eventType: 'trend_manipulation' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return reply.send({ alerts });
    } catch (e) {
      request.log.warn({ err: e }, 'Trend manipulation alerts error');
      return reply.status(500).send({ error: 'TREND_MANIPULATION_ERROR', message: e?.message });
    }
  });
  /* ── Gift ring detection (admin): graph A→B→C→A, flag when cluster transactions > threshold ── */
  app.get('/moderation/gift-rings/alerts', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 20));
      const alerts = await db.FraudEvent.find({ eventType: 'gift', signals: 'gift_ring' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return reply.send({ alerts });
    } catch (e) {
      request.log.warn({ err: e }, 'Gift ring alerts error');
      return reply.status(500).send({ error: 'GIFT_RING_ERROR', message: e?.message });
    }
  });
  app.get('/moderation/gift-rings/clusters', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const fraudService = require('../services/fraudService');
      const windowDays = Number(request.query.windowDays) || fraudService.GIFT_RING_WINDOW_DAYS;
      const threshold = Number(request.query.threshold) || fraudService.GIFT_RING_TRANSACTION_THRESHOLD;
      const result = await fraudService.detectGiftRings(windowDays, threshold);
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'Gift ring clusters error');
      return reply.status(500).send({ error: 'GIFT_RING_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/gift-rings/run', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const fraudService = require('../services/fraudService');
      const windowDays = Number(request.body?.windowDays || request.query?.windowDays) || fraudService.GIFT_RING_WINDOW_DAYS;
      const threshold = Number(request.body?.threshold || request.query?.threshold) || fraudService.GIFT_RING_TRANSACTION_THRESHOLD;
      const result = await fraudService.runGiftRingDetectionAndFlag(windowDays, threshold);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      request.log.warn({ err: e }, 'Gift ring run error');
      return reply.status(500).send({ error: 'GIFT_RING_ERROR', message: e?.message });
    }
  });

  /* ── Creator revenue velocity (revenue spike) detection ── */
  app.get('/moderation/revenue-spike/alerts', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 20));
      const alerts = await db.FraudEvent.find({ eventType: 'creator_revenue_spike' })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      return reply.send({ alerts });
    } catch (e) {
      request.log.warn({ err: e }, 'Revenue spike alerts error');
      return reply.status(500).send({ error: 'REVENUE_SPIKE_ERROR', message: e?.message });
    }
  });
  app.get('/moderation/revenue-spike/check/:creatorId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const creatorRevenueVelocityService = require('../services/creatorRevenueVelocityService');
      const result = await creatorRevenueVelocityService.detectRevenueSpike(request.params.creatorId);
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'Revenue spike check error');
      return reply.status(500).send({ error: 'REVENUE_SPIKE_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/revenue-spike/run', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const creatorRevenueVelocityWorker = require('../workers/creatorRevenueVelocityWorker');
      await creatorRevenueVelocityWorker.runRevenueVelocityCheck();
      return reply.send({ ok: true });
    } catch (e) {
      request.log.warn({ err: e }, 'Revenue spike run error');
      return reply.status(500).send({ error: 'REVENUE_SPIKE_ERROR', message: e?.message });
    }
  });

  /* ── Monetization risk alerts (fraud team) ── */
  app.get('/moderation/monetization-risk/alerts', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const monetizationRiskAlertService = require('../services/monetizationRiskAlertService');
      const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 50));
      const trigger = request.query.trigger || null;
      const alerts = await monetizationRiskAlertService.getRecentAlerts(limit, trigger);
      return reply.send({ alerts });
    } catch (e) {
      request.log.warn({ err: e }, 'Monetization risk alerts error');
      return reply.status(500).send({ error: 'MONETIZATION_RISK_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/monetization-risk/check-chargeback', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const monetizationRiskAlertService = require('../services/monetizationRiskAlertService');
      const result = await monetizationRiskAlertService.checkChargebackRateAlert();
      return reply.send({ ok: true, ...result });
    } catch (e) {
      request.log.warn({ err: e }, 'Monetization risk check-chargeback error');
      return reply.status(500).send({ error: 'MONETIZATION_RISK_ERROR', message: e?.message });
    }
  });

  /* ── Creator Review Queue (monetization risk manual review) ── */
  app.get('/moderation/creator-review-queue', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const creatorReviewQueueService = require('../services/creatorReviewQueueService');
      const status = request.query.status || null;
      const limit = Math.min(200, Math.max(1, Number(request.query.limit) || 100));
      const items = await creatorReviewQueueService.getQueue(status, limit);
      return reply.send({ items });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator review queue list error');
      return reply.status(500).send({ error: 'CREATOR_REVIEW_QUEUE_ERROR', message: e?.message });
    }
  });
  app.get('/moderation/creator-review-queue/:id', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.id, reply)) return;
    try {
      const creatorReviewQueueService = require('../services/creatorReviewQueueService');
      const item = await creatorReviewQueueService.getById(request.params.id);
      if (!item) return reply.status(404).send({ error: 'NOT_FOUND' });
      return reply.send(item);
    } catch (e) {
      request.log.warn({ err: e }, 'Creator review queue get error');
      return reply.status(500).send({ error: 'CREATOR_REVIEW_QUEUE_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/creator-review-queue/add', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const { creatorId, riskScore, reason, meta } = request.body ?? {};
    if (!creatorId || riskScore == null) return reply.status(400).send({ error: 'CREATOR_ID_AND_RISK_SCORE_REQUIRED' });
    if (!validateId(creatorId, reply)) return;
    try {
      const creatorReviewQueueService = require('../services/creatorReviewQueueService');
      const id = await creatorReviewQueueService.addToQueue(creatorId, riskScore, reason || 'Manual add', meta);
      return reply.send({ ok: true, queueId: id });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator review queue add error');
      return reply.status(500).send({ error: 'CREATOR_REVIEW_QUEUE_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/creator-review-queue/:id/assign', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (!validateId(request.params.id, reply)) return;
    const moderatorId = request.body?.moderatorId ?? admin._id;
    if (!validateId(moderatorId, reply)) return;
    try {
      const creatorReviewQueueService = require('../services/creatorReviewQueueService');
      const result = await creatorReviewQueueService.assignModerator(request.params.id, moderatorId);
      if (!result.ok) return reply.status(400).send({ error: result.error });
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'Creator review queue assign error');
      return reply.status(500).send({ error: 'CREATOR_REVIEW_QUEUE_ERROR', message: e?.message });
    }
  });
  app.post('/moderation/creator-review-queue/:id/resolve', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    if (!validateId(request.params.id, reply)) return;
    const { action, note } = request.body ?? {};
    if (!action || !['approve_payout', 'disable_monetization', 'temporary_suspension', 'permanent_ban'].includes(action)) {
      return reply.status(400).send({ error: 'ACTION_REQUIRED', valid: ['approve_payout', 'disable_monetization', 'temporary_suspension', 'permanent_ban'] });
    }
    try {
      const creatorReviewQueueService = require('../services/creatorReviewQueueService');
      const result = await creatorReviewQueueService.resolve(request.params.id, action, admin._id, note);
      if (!result.ok) return reply.status(400).send({ error: result.error, valid: result.valid });
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'Creator review queue resolve error');
      return reply.status(500).send({ error: 'CREATOR_REVIEW_QUEUE_ERROR', message: e?.message });
    }
  });

  app.get('/moderation/trend-manipulation/:tag', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const tag = request.params.tag;
    if (!tag || typeof tag !== 'string') return reply.status(400).send({ error: 'TAG_REQUIRED' });
    try {
      const trendManipulationService = require('../services/trendManipulationService');
      const shouldFlag = request.query.flag === 'true';
      const result = shouldFlag
        ? await trendManipulationService.checkAndFlagTrendManipulation(tag)
        : await trendManipulationService.detectTrendManipulation(tag);
      return reply.send(result);
    } catch (e) {
      request.log.warn({ err: e }, 'Trend manipulation check error');
      return reply.status(500).send({ error: 'TREND_MANIPULATION_ERROR', message: e?.message });
    }
  });

  /* ── Creator manipulation detection (admin): penalized when 5+ manipulated content in 7 days ── */
  app.get('/moderation/creator-manipulation/:creatorId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const creatorManipulationService = require('../services/creatorManipulationService');
      const creatorId = request.params.creatorId;
      const [manipulatedCount, penalized, reachMultiplier, monetizationEligible] = await Promise.all([
        creatorManipulationService.getManipulatedContentCount(creatorId),
        creatorManipulationService.isCreatorManipulationPenalized(creatorId),
        creatorManipulationService.getCreatorReachMultiplier(creatorId),
        creatorManipulationService.isMonetizationEligible(creatorId),
      ]);
      return reply.send({
        creatorId,
        manipulatedCount,
        penalized,
        reachMultiplier,
        monetizationEligible,
        windowDays: creatorManipulationService.WINDOW_DAYS,
        countThreshold: creatorManipulationService.COUNT_THRESHOLD,
        manipulatedScoreMax: creatorManipulationService.MANIPULATED_SCORE_MAX,
      });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator manipulation check error');
      return reply.status(500).send({ error: 'CREATOR_MANIPULATION_ERROR', message: e?.message });
    }
  });

  /* ── Creator Reputation Score (CRS): score 0–100, band, eligibility flags ── */
  app.get('/moderation/creator-reputation/:creatorId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const creatorReputationService = require('../services/creatorReputationService');
      const creatorId = request.params.creatorId;
      const refresh = request.query?.refresh === 'true';
      const reputation = refresh
        ? await creatorReputationService.computeCreatorReputation(creatorId, { persist: true })
        : await creatorReputationService.getCreatorReputation(creatorId);
      const [payoutEligible, livestreamMonetizationEligible, storefrontEligible, auctionEligible, promoMultiplier] = await Promise.all([
        creatorReputationService.isPayoutEligible(creatorId),
        creatorReputationService.isLivestreamMonetizationEligible(creatorId),
        creatorReputationService.isStorefrontEligible(creatorId),
        creatorReputationService.isAuctionEligible(creatorId),
        creatorReputationService.getAlgorithmicPromotionMultiplier(creatorId),
      ]);
      return reply.send({
        creatorId,
        score: reputation.score,
        reputationScore: reputation.reputationScore ?? reputation.score,
        band: reputation.band,
        factors: reputation.factors,
        metrics: reputation.metrics || {},
        monetizationStatus: reputation.monetizationStatus || {},
        payoutEligible,
        livestreamMonetizationEligible,
        storefrontEligible,
        auctionEligible,
        algorithmicPromotionMultiplier: promoMultiplier,
      });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator reputation check error');
      return reply.status(500).send({ error: 'CREATOR_REPUTATION_ERROR', message: e?.message });
    }
  });

  /* ── Creator Trust Timeline (admin): CRS history for dashboard chart ── */
  app.get('/moderation/creator-trust/:creatorId/history', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const creatorTrustHistoryService = require('../services/creatorTrustHistoryService');
      const creatorId = request.params.creatorId;
      const limit = request.query.limit ? Math.min(500, Math.max(1, Number(request.query.limit))) : 90;
      const order = request.query.order === 'asc' ? 1 : -1;
      const history = await creatorTrustHistoryService.getHistory(creatorId, { limit, order });
      return reply.send({ creatorId, history });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator trust history error');
      return reply.status(500).send({ error: 'CREATOR_TRUST_HISTORY_ERROR', message: e?.message });
    }
  });

  /* ── Bot farm graph detection (admin): high-density nodes + dense clusters ── */
  app.get('/moderation/bot-farm-clusters', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const botGraph = require('../services/botGraphDetection');
      const threshold = request.query.threshold ? Number(request.query.threshold) : undefined;
      const windowDays = request.query.windowDays ? Number(request.query.windowDays) : undefined;
      const [highDensityNodes, clusters] = await Promise.all([
        botGraph.getHighDensityNodes({ threshold, windowDays }),
        botGraph.detectBotFarmClusters({ threshold, windowDays }),
      ]);
      return reply.send({ highDensityNodes, clusters });
    } catch (e) {
      request.log.warn({ err: e }, 'Bot farm clusters error');
      return reply.status(500).send({ error: 'BOT_FARM_CLUSTERS_ERROR', message: e.message });
    }
  });

  /* ── Phase 6: Neo4j gift ring detection (admin, when NEO4J_URI set) ── */
  app.get('/moderation/neo4j/gift-rings', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const neo4jClusterService = require('../services/neo4jClusterService');
      if (!neo4jClusterService.isEnabled()) {
        return reply.send({ enabled: false, userIds: [], count: 0 });
      }
      const result = await neo4jClusterService.runGiftRingDetection();
      return reply.send({ enabled: true, ...result });
    } catch (e) {
      request.log.warn({ err: e }, 'Neo4j gift ring detection error');
      return reply.status(500).send({ error: 'NEO4J_ERROR', message: e?.message });
    }
  });

  /* ── Graph-based creator fraud signals (admin) ── */
  app.get('/moderation/creator-fraud-graph/:creatorId', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const creatorId = request.params?.creatorId;
    if (!creatorId || !validateId(creatorId, reply)) return;
    try {
      const neo4jClusterService = require('../services/neo4jClusterService');
      const signals = await neo4jClusterService.getCreatorFraudGraphSignals(creatorId);
      return reply.send({ enabled: neo4jClusterService.isEnabled(), ...signals });
    } catch (e) {
      request.log.warn({ err: e }, 'Creator fraud graph signals error');
      return reply.status(500).send({ error: 'NEO4J_ERROR', message: e?.message });
    }
  });

  /* ── ATO: admin clear risk lock (step-up bypass for support) ── */
  app.post('/moderation/risk-lock/clear', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const userId = request.body?.userId;
    if (!userId) return reply.status(400).send({ error: 'USER_ID_REQUIRED' });
    if (!validateId(userId, reply)) return;
    const accountTakeoverService = require('../services/accountTakeoverService');
    await accountTakeoverService.clearRiskLock(userId, { adminId: admin._id, meta: request.body?.reason ? { reason: request.body.reason } : {} });
    return reply.send({ ok: true, message: 'Risk lock cleared.' });
  });
}

module.exports = { moderationRoutes };
