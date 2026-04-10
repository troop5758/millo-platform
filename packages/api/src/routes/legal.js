'use strict';
/**
 * Legal — Terms, Privacy, Copyright/DMCA policy, takedown and counter-notice APIs.
 * Serves /legal/terms.html, privacy.html, copyright.html, payments-policy.html; DMCA agent; notice submission.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');
const db = require('@millo/database');
const { resolveSession } = require('./auth');
const { validateId } = require('../lib/validateId');
const dmcaService = require('../services/dmcaService');
const { writeAdminAuditLog } = require('../services/auditLog');

const legalDir = path.join(__dirname, '..', '..', 'legal');

async function getRequestUser(req) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const user = await resolveSession(token).catch(() => null);
    if (user) return user;
  }
  if (process.env.NODE_ENV !== 'production') {
    const id = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'user';
    if (id) return { _id: id, role };
  }
  return null;
}

async function legalRoutes(app) {
  app.get('/legal/terms.html', async (_request, reply) => {
    const file = path.join(legalDir, 'terms.html');
    const html = fs.readFileSync(file, 'utf8');
    return reply.type('text/html').send(html);
  });

  app.get('/legal/privacy.html', async (_request, reply) => {
    const file = path.join(legalDir, 'privacy.html');
    const html = fs.readFileSync(file, 'utf8');
    return reply.type('text/html').send(html);
  });

  app.get('/legal/payments-policy.html', async (_request, reply) => {
    const file = path.join(legalDir, 'payments-policy.html');
    if (!fs.existsSync(file)) return reply.status(404).send('Not found');
    const html = fs.readFileSync(file, 'utf8');
    return reply.type('text/html').send(html);
  });

  /* ── Copyright / DMCA policy page (with designated agent) ── */
  app.get('/legal/copyright.html', async (_request, reply) => {
    const file = path.join(legalDir, 'copyright.html');
    if (!fs.existsSync(file)) return reply.status(404).send('Not found');
    const agent = dmcaService.getDmcaAgent();
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/\{\{DMCA_AGENT_NAME\}\}/g, agent.name);
    html = html.replace(/\{\{DMCA_AGENT_ADDRESS\}\}/g, agent.address);
    html = html.replace(/\{\{DMCA_AGENT_EMAIL\}\}/g, agent.email);
    return reply.type('text/html').send(html);
  });

  /* ── DMCA agent (JSON for forms) ── */
  app.get('/legal/dmca/agent', async (_request, reply) => {
    return reply.send(dmcaService.getDmcaAgent());
  });

  /* ── Submit DMCA takedown notice (public) ── */
  async function handleDmcaTakedownNotice(request, reply) {
    try {
      const notice = await dmcaService.submitTakedownNotice(request.body || {}, request);
      return reply.status(201).send({
        ok: true,
        message: 'Takedown notice received. We will review it and respond in accordance with the DMCA.',
        noticeId: notice.notice._id,
      });
    } catch (e) {
      if (e.message === 'DMCA_MISSING_REQUIRED') return reply.status(400).send({ error: 'DMCA_MISSING_REQUIRED', message: 'Required fields: claimantName, claimantEmail, workDescription, targetType, targetId' });
      if (e.message === 'DMCA_INVALID_TARGET_TYPE') return reply.status(400).send({ error: 'DMCA_INVALID_TARGET_TYPE', valid: ['stream', 'event', 'product', 'content'] });
      request.log.warn({ err: e }, 'DMCA takedown notice error');
      return reply.status(400).send({ error: 'DMCA_SUBMIT_ERROR', message: e.message });
    }
  }
  app.post('/legal/dmca/takedown-notice', handleDmcaTakedownNotice);
  app.post('/legal/dmca-report', handleDmcaTakedownNotice);

  /* ── Submit counter-notice (auth: content owner only) ── */
  app.post('/legal/dmca/counter-notice', async (request, reply) => {
    const user = await getRequestUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { noticeId, signerName, signerEmail, signerAddress, goodFaithStatement, consentToJurisdiction } = request.body || {};
    if (!noticeId || !validateId(noticeId, reply)) return;
    try {
      const notice = await dmcaService.submitCounterNotice(noticeId, user._id, {
        signerName,
        signerEmail,
        signerAddress,
        goodFaithStatement,
        consentToJurisdiction,
      });
      await dmcaService.notifyClaimantOfCounterNotice(noticeId);
      return reply.status(201).send({
        ok: true,
        message: 'Counter-notice received. The claimant has been notified. Content may be restored after the statutory period if no court action is filed.',
        noticeId: notice._id,
        restoreAfter: notice.counterNotice?.restoreAfter,
      });
    } catch (e) {
      if (e.message === 'DMCA_NOTICE_NOT_FOUND') return reply.status(404).send({ error: 'DMCA_NOTICE_NOT_FOUND' });
      if (e.message === 'DMCA_NOT_COUNTER_NOTICE_ELIGIBLE') return reply.status(400).send({ error: 'DMCA_NOT_COUNTER_NOTICE_ELIGIBLE' });
      if (e.message === 'DMCA_NOT_CONTENT_OWNER') return reply.status(403).send({ error: 'DMCA_NOT_CONTENT_OWNER' });
      if (e.message === 'DMCA_COUNTER_MISSING_REQUIRED') return reply.status(400).send({ error: 'DMCA_COUNTER_MISSING_REQUIRED', message: 'signerName and signerEmail required' });
      request.log.warn({ err: e }, 'DMCA counter-notice error');
      return reply.status(400).send({ error: 'DMCA_COUNTER_ERROR', message: e.message });
    }
  });

  /* ── Admin: list DMCA notices ── */
  app.get('/legal/dmca/notices', async (request, reply) => {
    const admin = await getRequestUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { status, limit = 50, offset = 0 } = request.query || {};
    const query = status ? { status } : {};
    const [notices, total] = await Promise.all([
      db.DmcaNotice.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.DmcaNotice.countDocuments(query),
    ]);
    return reply.send({ notices, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Admin: accept notice and take down content ── */
  app.post('/legal/dmca/notices/:id/accept', async (request, reply) => {
    const admin = await getRequestUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    try {
      const notice = await dmcaService.acceptNoticeAndTakedown(request.params.id, admin._id);
      await dmcaService.notifyContentOwnerOfTakedown(request.params.id);
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'dmca_accept_takedown',
        targetId: request.params.id,
        meta: { targetType: notice.targetType, targetId: String(notice.targetId) },
      });
      const repeat = await dmcaService.isRepeatInfringer(notice.contentOwnerId);
      return reply.send({ ok: true, notice: notice.toObject(), repeatInfringer: repeat });
    } catch (e) {
      if (e.message === 'DMCA_NOTICE_NOT_FOUND') return reply.status(404).send({ error: 'DMCA_NOTICE_NOT_FOUND' });
      if (e.message === 'DMCA_NOTICE_ALREADY_PROCESSED') return reply.status(400).send({ error: 'DMCA_NOTICE_ALREADY_PROCESSED' });
      throw e;
    }
  });

  /* ── Admin: reject notice ── */
  app.post('/legal/dmca/notices/:id/reject', async (request, reply) => {
    const admin = await getRequestUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const { reason } = request.body || {};
    const notice = await db.DmcaNotice.findById(request.params.id);
    if (!notice) return reply.status(404).send({ error: 'DMCA_NOTICE_NOT_FOUND' });
    if (notice.status !== 'pending') return reply.status(400).send({ error: 'DMCA_NOTICE_ALREADY_PROCESSED' });
    notice.status = 'rejected';
    notice.reviewedBy = admin._id;
    notice.reviewedAt = new Date();
    notice.rejectionReason = (reason || '').trim().slice(0, 1000);
    await notice.save();
    await writeAdminAuditLog({ adminId: admin._id, action: 'dmca_reject', targetId: request.params.id, meta: { reason: notice.rejectionReason } });
    return reply.send({ ok: true, notice: notice.toObject() });
  });

  /* ── Admin: restore content after counter-notice period ── */
  app.post('/legal/dmca/notices/:id/restore', async (request, reply) => {
    const admin = await getRequestUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    try {
      const notice = await dmcaService.restoreAfterCounterNotice(request.params.id);
      await writeAdminAuditLog({ adminId: admin._id, action: 'dmca_restore', targetId: request.params.id });
      return reply.send({ ok: true, notice: notice.toObject() });
    } catch (e) {
      if (e.message === 'DMCA_NOTICE_NOT_FOUND') return reply.status(404).send({ error: 'DMCA_NOTICE_NOT_FOUND' });
      if (e.message === 'DMCA_NO_COUNTER_NOTICE') return reply.status(400).send({ error: 'DMCA_NO_COUNTER_NOTICE' });
      if (e.message === 'DMCA_LAWSUIT_FILED') return reply.status(400).send({ error: 'DMCA_LAWSUIT_FILED' });
      if (e.message === 'DMCA_RESTORE_DATE_NOT_REACHED') return reply.status(400).send({ error: 'DMCA_RESTORE_DATE_NOT_REACHED' });
      throw e;
    }
  });

  /* ── Admin: mark lawsuit filed (do not restore) ── */
  app.post('/legal/dmca/notices/:id/lawsuit-filed', async (request, reply) => {
    const admin = await getRequestUser(request);
    if (!admin || admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    try {
      const notice = await dmcaService.markLawsuitFiled(request.params.id);
      await writeAdminAuditLog({ adminId: admin._id, action: 'dmca_lawsuit_filed', targetId: request.params.id });
      return reply.send({ ok: true, notice: notice.toObject() });
    } catch (e) {
      if (e.message === 'DMCA_NOTICE_NOT_FOUND') return reply.status(404).send({ error: 'DMCA_NOTICE_NOT_FOUND' });
      if (e.message === 'DMCA_NO_COUNTER_NOTICE') return reply.status(400).send({ error: 'DMCA_NO_COUNTER_NOTICE' });
      throw e;
    }
  });
}

module.exports = { legalRoutes };
