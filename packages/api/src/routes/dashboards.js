/**
 * Dashboards API — Admin / Mod / Support. RBAC enforced, overrides logged.
 * Expects req.user = { _id, role } (set by auth middleware or X-User-Id / X-User-Role for testing).
 * https://milloapp.com
 */
const dashboards = require('@millo/dashboards');
const db = require('@millo/database');
const { USER_ACCOUNT_STATUS } = require('@millo/shared').userAccountStatus;
const { writeAdminAuditLog } = require('../services/auditLog');
const chargebackService = require('../services/chargebackService');
const anomalyService = require('../services/anomalyService');
const riskEngine = require('../services/riskEngine');
const adminTrustRiskService = require('../services/adminTrustRiskService');
const botGraphDetection = require('../services/botGraphDetection');
const liveStreamBotDetection = require('../services/liveStreamBotDetection');
const securityDashboardService = require('../services/securityDashboardService');
const compliance = require('@millo/compliance');
const { PlatformSettings } = require('@millo/database');
const { validateId } = require('../lib/validateId');
const branding = require('@millo/notifications/src/branding');
const { sendCustomerEmail } = require('../lib/customerEmail');
const { getCapabilities } = require('../config/capabilities');
const bcrypt = require('bcryptjs');
const BCRYPT_ROUNDS = 12;

/* ── Branding keys stored in PlatformSettings ── */
const BRANDING_KEYS = ['logoUrl', 'appName', 'appUrl', 'accentColor', 'supportEmail'];
// Phase 3: Admin toggle removed — only emailTypes, pushTypes (no emailEnabled/pushEnabled)
const NOTIF_KEYS = ['emailTypes', 'pushTypes'];

async function readSettings(keys) {
  const docs = await PlatformSettings.find({ key: { $in: keys } }).lean();
  const out = {};
  for (const d of docs) out[d.key] = d.value;
  return out;
}

async function writeSettings(keyValueMap, updatedBy) {
  const ops = Object.entries(keyValueMap).map(([key, value]) => ({
    updateOne: {
      filter: { key },
      update: { $set: { key, value, updatedBy } },
      upsert: true,
    },
  }));
  if (ops.length) await PlatformSettings.bulkWrite(ops);
}

async function getRequestUser(req) {
  // 1. Prefer a proper session token (Bearer auth)
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (token) {
    const { resolveSession } = require('./auth');
    const user = await resolveSession(token).catch(() => null);
    if (user) return user;
  }

  // 2. Test/internal header-based identity — ONLY allowed when not in production
  //    (prevents header spoofing in live environments)
  if (process.env.NODE_ENV !== 'production') {
    const id   = req.headers['x-user-id'];
    const role = req.headers['x-user-role'] || 'user';
    if (id) return { _id: id, role };
  }

  return null;
}

async function dashboardsRoutes(app) {
  // Admin
  app.post('/dashboards/admin/financial-ops', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.financialOps(user, req.body?.action, req.body?.payload || {});
      await writeAdminAuditLog({
        adminId: user._id,
        action:  'financial_ops',
        meta:    { op: req.body?.action, payload: req.body?.payload },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.post('/dashboards/admin/kill-switch', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.killSwitch(user, req.body?.which, req.body?.enabled);
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.code === 'INVALID_TOGGLE' || e.message === 'INVALID_TOGGLE') {
        return reply.status(400).send({ error: 'INVALID_TOGGLE', message: 'feature must be ads, milla, or filters' });
      }
      throw e;
    }
  });

  /** GET /admin/feature-toggles — current ads / milla / live filters (RBAC: admin | support | ops). */
  app.get('/admin/feature-toggles', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      dashboards.requireFeatureToggleAccess(user);
      return reply.send(dashboards.getFeatureToggleEffective());
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });

  app.get('/dashboards/admin/feature-toggles', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      dashboards.requireFeatureToggleAccess(user);
      return reply.send(dashboards.getFeatureToggleEffective());
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });

  /**
   * POST /admin/feature-toggle — body: { feature | which, enabled: boolean }
   * RBAC: admin | support | ops. Persists to PlatformSettings + process.env.
   */
  app.post('/admin/feature-toggle', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send({ error: 'INVALID_BODY', message: 'enabled must be a boolean' });
    }
    const which = req.body?.feature != null ? req.body.feature : req.body?.which;
    try {
      const out = await dashboards.killSwitch(user, which, enabled);
      return reply.send({ ok: true, toggles: dashboards.getFeatureToggleEffective(), ...out });
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.code === 'INVALID_TOGGLE' || e.message === 'INVALID_TOGGLE') {
        return reply.status(400).send({ error: 'INVALID_TOGGLE', message: 'feature must be ads, milla, or filters' });
      }
      throw e;
    }
  });

  app.post('/dashboards/admin/feature-toggle', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return reply.status(400).send({ error: 'INVALID_BODY', message: 'enabled must be a boolean' });
    }
    const which = req.body?.feature != null ? req.body.feature : req.body?.which;
    try {
      const out = await dashboards.killSwitch(user, which, enabled);
      return reply.send({ ok: true, toggles: dashboards.getFeatureToggleEffective(), ...out });
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.code === 'INVALID_TOGGLE' || e.message === 'INVALID_TOGGLE') {
        return reply.status(400).send({ error: 'INVALID_TOGGLE', message: 'feature must be ads, milla, or filters' });
      }
      throw e;
    }
  });
  app.get('/dashboards/admin/financial-view/:userId', async (req, reply) => {
    if (!validateId(req.params.userId, reply)) return;
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const ledgerLimit = Number(req.query?.ledgerLimit) || 50;
      const auditLimit = Number(req.query?.auditLimit) || 50;
      const out = await dashboards.getFinancialView(user, req.params.userId, { ledgerLimit, auditLimit });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.get('/dashboards/admin/ledger/:userId', async (req, reply) => {
    if (!validateId(req.params.userId, reply)) return;
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const limit = Number(req.query?.limit) || 50;
      const entries = await dashboards.ledgerView(user, req.params.userId, limit);
      return reply.send(entries);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.get('/dashboards/admin/fraud-alerts', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const limit = Number(req.query?.limit) || 100;
      const eventType = req.query?.eventType || null;
      const alerts = await dashboards.getFraudAlerts(user, { limit, eventType });
      return reply.send(alerts);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.post('/dashboards/admin/economy', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.economyControl(user, req.body?.action, req.body?.payload || {});
      await writeAdminAuditLog({
        adminId: user._id, action: 'economy_control',
        meta: { op: req.body?.action, payload: req.body?.payload },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  /* ── Gift reversal (admin, anti-fraud) ── */
  app.post('/dashboards/admin/gifts/:ledgerEntryId/reverse', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.ledgerEntryId, reply)) return;
    try {
      const economy = require('@millo/economy');
      const out = await economy.reverseGift(req.params.ledgerEntryId, user._id);
      await writeAdminAuditLog({
        adminId: user._id,
        action: 'gift_reversal',
        targetType: 'LedgerEntry',
        targetId: req.params.ledgerEntryId,
        overrideReason: req.body?.reason || null,
        meta: { senderId: out.senderId, receiverId: out.receiverId, amountCents: out.amountCents },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'LEDGER_ENTRY_NOT_FOUND') return reply.status(404).send({ error: 'LEDGER_ENTRY_NOT_FOUND' });
      if (e.message === 'NOT_A_GIFT_DEBIT') return reply.status(400).send({ error: 'NOT_A_GIFT_DEBIT' });
      if (e.message === 'ALREADY_REVERSED') return reply.status(409).send({ error: 'ALREADY_REVERSED' });
      if (e.message === 'INSUFFICIENT_BALANCE') return reply.status(400).send({ error: 'INSUFFICIENT_BALANCE', message: 'Receiver has insufficient balance to reverse' });
      throw e;
    }
  });
  /* ── Chargebacks (admin) ── */
  app.get('/dashboards/admin/chargebacks', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const { status, userId, limit, offset } = req.query ?? {};
      const out = await chargebackService.listChargebacks({ status, userId, limit, offset });
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });
  app.get('/dashboards/admin/chargebacks/summary', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const out = await chargebackService.getChargebackSummary();
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });
  app.get('/dashboards/admin/chargebacks/high-risk', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const minChargebacks = Math.max(1, Number(req.query.min) || 2);
      const users = await chargebackService.getHighRiskUsers(minChargebacks);
      return reply.send({ highRiskUsers: users });
    } catch (e) {
      throw e;
    }
  });
  app.get('/dashboards/admin/chargebacks/:id', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const cb = await chargebackService.getChargebackById(req.params.id);
      if (!cb) return reply.status(404).send({ error: 'CHARGEBACK_NOT_FOUND' });
      return reply.send(cb);
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/admin/chargebacks/:id/note', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { note } = req.body ?? {};
    try {
      const cb = await chargebackService.addAdminNote(req.params.id, user._id, note);
      if (!cb) return reply.status(404).send({ error: 'CHARGEBACK_NOT_FOUND' });
      await writeAdminAuditLog({
        adminId: user._id,
        action: 'chargeback_note',
        targetId: req.params.id,
        meta: { noteLength: String(note || '').length },
      });
      return reply.send(cb);
    } catch (e) {
      throw e;
    }
  });

  /* ── Financial anomaly alerts (admin) ── */
  app.get('/dashboards/admin/anomalies', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const lookbackDays = Math.min(30, Math.max(1, Number(req.query?.lookbackDays) || 7));
      const out = await anomalyService.detectAnomalies({ lookbackDays });
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });

  /* ── Admin user CRUD (support: list, update, suspend) ── */
  app.get('/dashboards/admin/users', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const limit = Math.min(Number(req.query?.limit) || 50, 100);
      const page = Math.max(1, Number(req.query?.page) || 1);
      const offset = (page - 1) * limit;
      const roleFilter = req.query?.role ? String(req.query.role).trim() : null;
      const q = req.query?.q ? String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const query = {};
      if (roleFilter) query.role = roleFilter;
      if (q) query.email = { $regex: q, $options: 'i' };
      const [users, total] = await Promise.all([
        db.User.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
        db.User.countDocuments(query),
      ]);
      const profileIds = users.map((u) => u._id);
      const profiles = await db.Profile.find({ userId: { $in: profileIds } }).lean();
      const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
      const enriched = users.map((u) => ({
        ...u,
        displayName: profileMap[String(u._id)]?.displayName || u.email?.split('@')[0],
        username: profileMap[String(u._id)]?.meta?.username,
        avatarUrl: profileMap[String(u._id)]?.avatarUrl,
      }));
      return reply.send({ users: enriched, total, limit, offset, page });
    } catch (e) {
      throw e;
    }
  });

  /* ── Admin audit logs (compliance; admin only) ── */
  app.get('/dashboards/admin/audit-logs', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const limit = Math.min(Number(req.query?.limit) || 50, 200);
      const offset = Math.max(0, Number(req.query?.offset) || 0);
      const actionFilter = req.query?.action ? String(req.query.action).trim() : null;
      const query = actionFilter ? { action: actionFilter } : {};
      const [logs, total] = await Promise.all([
        db.AdminAuditLog.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).populate('adminId', 'email').lean(),
        db.AdminAuditLog.countDocuments(query),
      ]);
      return reply.send({ logs, total, limit, offset });
    } catch (e) {
      throw e;
    }
  });

  /* ── Phase 11: Admin user CRUD aliases ── */
  app.get('/admin/users', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const limit = Math.min(Number(req.query?.limit) || 50, 100);
    const offset = Math.max(0, Number(req.query?.offset) || 0);
    const q = String(req.query?.q || '').trim();
    const query = q ? { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
    const [users, total] = await Promise.all([
      db.User.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      db.User.countDocuments(query),
    ]);
    return reply.send({ users, total, limit, offset });
  });

  app.post('/admin/create-support', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin access required' });
    const { email, password, displayName, canModerate = true, canViewTickets = true, canRespondTickets = true } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return reply.status(400).send({ error: 'EMAIL_REQUIRED' });
    if (!password || typeof password !== 'string') return reply.status(400).send({ error: 'PASSWORD_REQUIRED' });
    if (password.length < 8) return reply.status(400).send({ error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' });
    const exists = await db.User.findOne({ email: normalizedEmail }).lean();
    if (exists) return reply.status(409).send({ error: 'EMAIL_EXISTS' });
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const supportUser = await db.User.create({
      email: normalizedEmail,
      role: 'support',
      status: 'active',
      createdBy: admin._id,
      permissions: {
        canModerate: !!canModerate,
        canViewTickets: !!canViewTickets,
        canRespondTickets: !!canRespondTickets,
      },
      flags: { passwordHash: hash },
    });
    await db.Profile.create({
      userId: supportUser._id,
      displayName: (displayName && String(displayName).trim()) || normalizedEmail.split('@')[0],
    }).catch(() => {});
    await db.Wallet.create({ userId: supportUser._id, balanceCents: 0 }).catch(() => {});
    await writeAdminAuditLog({
      adminId: admin._id,           // performedBy
      action: 'CREATE_SUPPORT_ACCOUNT',
      targetType: 'User',
      targetId: supportUser._id.toString(),  // targetUser
      meta: { email: normalizedEmail },      // metadata
    });
    return reply.status(201).send({
      message: 'Support account created',
      userId: supportUser._id.toString(),
    });
  });

  app.post('/admin/users', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { email, role = 'user', status = 'active', creatorStatus = 'none', displayName } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return reply.status(400).send({ error: 'EMAIL_REQUIRED' });
    const exists = await db.User.findOne({ email: normalizedEmail }).lean();
    if (exists) return reply.status(409).send({ error: 'EMAIL_EXISTS' });
    const created = await db.User.create({
      email: normalizedEmail,
      role,
      status,
      creatorStatus,
      flags: {},
    });
    if (displayName && String(displayName).trim()) {
      await db.Profile.findOneAndUpdate(
        { userId: created._id },
        { $set: { displayName: String(displayName).trim().slice(0, 100) } },
        { upsert: true, new: true }
      ).catch(() => {});
    }
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'admin_user_create',
      targetType: 'User',
      targetId: String(created._id),
      meta: { email: normalizedEmail, role, status, creatorStatus },
    });
    return reply.status(201).send(created.toObject ? created.toObject() : created);
  });

  app.patch('/admin/users/:id', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (req.body?.role != null && admin.role !== 'admin') return reply.status(403).send({ error: 'CANNOT_ASSIGN_ROLES', message: 'Cannot assign roles' });
    if (!validateId(req.params.id, reply)) return;
    const allowed = ['email', 'role', 'status', 'creatorStatus', 'flags', 'suspensionReason'];
    const patch = {};
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.email) patch.email = String(patch.email).trim().toLowerCase();
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'NO_VALID_FIELDS', allowed });
    const target = await db.User.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true }).lean();
    if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'admin_user_patch',
      targetType: 'User',
      targetId: req.params.id,
      meta: { patch },
    });
    return reply.send(target);
  });

  /* ── Bot risk score (admin) ── */
  app.get('/dashboards/admin/risk/:userId', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.userId, reply)) return;
    const uid = req.params.userId;
    const [{ risk, graph }, { score, signals }] = await Promise.all([
      adminTrustRiskService.getAdminTrustRiskView(uid),
      riskEngine.calculateRisk(uid),
    ]);
    return reply.send({ userId: uid, risk, graph, score, signals });
  });
  app.get('/admin/risk/:userId', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.userId, reply)) return;
    const uid = req.params.userId;
    const [{ risk, graph }, { score, signals }] = await Promise.all([
      adminTrustRiskService.getAdminTrustRiskView(uid),
      riskEngine.calculateRisk(uid),
    ]);
    return reply.send({ userId: uid, risk, graph, score, signals });
  });

  /* ── Bot farm / graph detection (admin) ── */
  app.get('/dashboards/admin/bot-cluster/:userId', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.userId, reply)) return;
    const result = await botGraphDetection.detectBotCluster(req.params.userId);
    return reply.send({ userId: req.params.userId, ...result });
  });
  app.get('/admin/bot-cluster/:userId', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.userId, reply)) return;
    const result = await botGraphDetection.detectBotCluster(req.params.userId);
    return reply.send({ userId: req.params.userId, ...result });
  });

  /* ── Live stream bot detection (admin) ── */
  app.get('/dashboards/admin/streams/:streamId/bot-check', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.streamId, reply)) return;
    const result = await liveStreamBotDetection.flagStream(req.params.streamId);
    return reply.send({ streamId: req.params.streamId, ...result });
  });
  app.get('/admin/streams/:streamId/bot-check', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.streamId, reply)) return;
    const result = await liveStreamBotDetection.flagStream(req.params.streamId);
    return reply.send({ streamId: req.params.streamId, ...result });
  });

  /* ── Security dashboard (admin): suspicious accounts, bot clusters, device fingerprints, risk scores, live alerts ── */
  app.get('/dashboards/admin/security/dashboard', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const data = await securityDashboardService.getSecurityDashboard();
    return reply.send(data);
  });
  app.get('/admin/security/dashboard', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const data = await securityDashboardService.getSecurityDashboard();
    return reply.send(data);
  });

  /* ── Moderation dashboard: Content Authenticity Panel + Trend Monitoring Panel ── */
  const moderationDashboardService = require('../services/moderationDashboardService');
  app.get('/dashboards/admin/moderation/dashboard', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const days = req.query.days ? Number(req.query.days) : undefined;
    const data = await moderationDashboardService.getModerationDashboard({ limit, days });
    return reply.send(data);
  });
  app.get('/dashboards/admin/moderation/content-authenticity', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const days = req.query.days ? Number(req.query.days) : undefined;
    const data = await moderationDashboardService.getContentAuthenticityPanel({ limit, days });
    return reply.send(data);
  });
  app.get('/dashboards/admin/moderation/trend-monitoring', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const days = req.query.days ? Number(req.query.days) : undefined;
    const data = await moderationDashboardService.getTrendMonitoringPanel({ limit, days });
    return reply.send(data);
  });

  app.delete('/admin/users/:id', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    const target = await db.User.findById(req.params.id).lean();
    if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
    await Promise.all([
      db.User.deleteOne({ _id: req.params.id }),
      db.Profile.deleteOne({ userId: req.params.id }),
      db.Session.deleteMany({ userId: req.params.id }),
      db.UserDevice?.deleteMany?.({ userId: req.params.id }).catch(() => {}),
    ]);
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'admin_user_delete',
      targetType: 'User',
      targetId: req.params.id,
      meta: { email: target.email },
    });
    return reply.send({ ok: true, deleted: true, userId: req.params.id });
  });

  app.get('/dashboards/admin/users/:id', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    try {
      const target = await db.User.findById(req.params.id).lean();
      if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
      const profile = await db.Profile.findOne({ userId: target._id }).lean();
      return reply.send({
        ...target,
        displayName: profile?.displayName || target.email?.split('@')[0],
        username: profile?.meta?.username,
        avatarUrl: profile?.avatarUrl,
      });
    } catch (e) {
      throw e;
    }
  });

  app.patch('/dashboards/admin/users/:id', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (req.body?.role != null && admin.role !== 'admin') return reply.status(403).send({ error: 'CANNOT_ASSIGN_ROLES', message: 'Cannot assign roles' });
    if (!validateId(req.params.id, reply)) return;
    const body = req.body ?? {};
    const allowed = ['role', 'creatorStatus', 'flags', 'permissions'];
    const patch = {};
    for (const k of allowed) {
      if (body[k] !== undefined) patch[k] = body[k];
    }
    if (patch.role != null && admin.role !== 'admin') return reply.status(403).send({ error: 'CANNOT_ASSIGN_ROLES', message: 'Cannot assign roles' });
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'NO_VALID_FIELDS', allowed });
    try {
      const target = await db.User.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true }).lean();
      if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'admin_user_update',
        targetType: 'User',
        targetId: req.params.id,
        meta: { patch },
      });
      return reply.send(target);
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/admin/users/:id/suspend', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    try {
      const target = await db.User.findById(req.params.id);
      if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
      target.status = USER_ACCOUNT_STATUS.SUSPENDED;
      if (target.flags) target.flags.suspended = true;
      else target.flags = { suspended: true };
      await target.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'admin_user_suspend',
        targetType: 'User',
        targetId: req.params.id,
        overrideReason: req.body?.reason || null,
        meta: {},
      });
      return reply.send({ ok: true, user: target.toObject(), suspended: true });
    } catch (e) {
      throw e;
    }
  });

  /* ── Admin: grant creator badge ── */
  const BADGE_IDS = ['verified_creator', 'top_creator', 'rising_creator', 'live_star'];
  app.post('/dashboards/admin/creators/:creatorId/badges', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.creatorId, reply)) return;
    const badgeId = (req.body?.badge || req.body?.badgeId || '').toString().replace(/^verified$/, 'verified_creator');
    if (!BADGE_IDS.includes(badgeId)) {
      return reply.status(400).send({ error: 'INVALID_BADGE', allowed: BADGE_IDS });
    }
    try {
      const def = await db.CreatorBadge.findOne({ badgeId, active: true }).lean();
      const label = def?.label || badgeId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const icon = def?.icon || 'check';
      const profile = await db.Profile.findOne({ userId: req.params.creatorId });
      if (!profile) return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' });
      const hasBadge = (profile.badges || []).some((b) => b.badgeId === badgeId);
      if (!hasBadge) {
        profile.badges = profile.badges || [];
        profile.badges.push({ badgeId, label, icon });
        await profile.save();
      }
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'creator_badge_grant',
        targetType: 'Profile',
        targetId: String(profile._id),
        meta: { creatorId: req.params.creatorId, badgeId },
      });
      return reply.send({ ok: true, badge: { badgeId, label, icon }, granted: !hasBadge });
    } catch (e) {
      throw e;
    }
  });

  app.delete('/dashboards/admin/creators/:creatorId/badges/:badgeId', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.creatorId, reply)) return;
    const badgeId = (req.params.badgeId || '').toString().replace(/^verified$/, 'verified_creator');
    if (!BADGE_IDS.includes(badgeId)) {
      return reply.status(400).send({ error: 'INVALID_BADGE', allowed: BADGE_IDS });
    }
    try {
      const profile = await db.Profile.findOne({ userId: req.params.creatorId });
      if (!profile) return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' });
      const before = (profile.badges || []).length;
      profile.badges = (profile.badges || []).filter((b) => b.badgeId !== badgeId);
      const revoked = before > profile.badges.length;
      if (revoked) await profile.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'creator_badge_revoke',
        targetType: 'Profile',
        targetId: String(profile._id),
        meta: { creatorId: req.params.creatorId, badgeId },
      });
      return reply.send({ ok: true, revoked });
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/admin/users/:id/unsuspend', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    try {
      const target = await db.User.findById(req.params.id);
      if (!target) return reply.status(404).send({ error: 'USER_NOT_FOUND' });
      if (target.status === USER_ACCOUNT_STATUS.BANNED) {
        return reply.status(400).send({
          error: 'USER_BANNED',
          message: 'Account is banned; use unban to reinstate.',
        });
      }
      target.status = USER_ACCOUNT_STATUS.ACTIVE;
      if (target.flags) target.flags.suspended = false;
      else target.flags = {};
      await target.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'admin_user_unsuspend',
        targetType: 'User',
        targetId: req.params.id,
        overrideReason: req.body?.reason || null,
        meta: {},
      });
      return reply.send({ ok: true, user: target.toObject(), suspended: false });
    } catch (e) {
      throw e;
    }
  });

  /* ── Admin: seller verification (list, approve, reject) ── */
  app.get('/dashboards/admin/seller-verifications', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { status = 'pending', sellerStatus, limit = 50, offset = 0 } = req.query ?? {};
    const filter = status === 'all' ? {} : { status };
    if (sellerStatus && ['pending', 'verified', 'blocked'].includes(String(sellerStatus))) {
      filter.sellerStatus = String(sellerStatus);
    }
    try {
      const [list, total] = await Promise.all([
        db.SellerVerification.find(filter).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('userId', 'email').lean(),
        db.SellerVerification.countDocuments(filter),
      ]);
      const userIds = list.map((v) => v.userId?._id).filter(Boolean);
      const profiles = await db.Profile.find({ userId: { $in: userIds } }).select('userId displayName').lean();
      const profileMap = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
      const commerceIntegrity = require('../services/commerceIntegrity.service');
      const enriched = list.map((v) => ({
        ...v,
        effectiveSellerStatus: commerceIntegrity.getEffectiveSellerStatus(v),
        displayName: profileMap[String(v.userId?._id)]?.displayName || v.userId?.email?.split('@')[0],
      }));
      return reply.send({ verifications: enriched, total, limit: Number(limit), offset: Number(offset) });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/seller-verifications/:id/approve', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    try {
      const v = await db.SellerVerification.findById(req.params.id);
      if (!v) return reply.status(404).send({ error: 'NOT_FOUND' });
      if (v.status !== 'pending') return reply.status(400).send({ error: 'NOT_PENDING', status: v.status });
      v.status = 'approved';
      v.sellerStatus = 'verified';
      v.reviewedBy = admin._id;
      v.reviewedAt = new Date();
      await v.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'seller_verification_approve',
        targetType: 'SellerVerification',
        targetId: req.params.id,
        meta: { userId: String(v.userId) },
      });
      return reply.send({ ok: true, verification: v.toObject() });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/seller-verifications/:id/reject', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    const { reason } = req.body ?? {};
    try {
      const v = await db.SellerVerification.findById(req.params.id);
      if (!v) return reply.status(404).send({ error: 'NOT_FOUND' });
      if (v.status !== 'pending') return reply.status(400).send({ error: 'NOT_PENDING', status: v.status });
      v.status = 'rejected';
      v.sellerStatus = 'pending';
      v.reviewedBy = admin._id;
      v.reviewedAt = new Date();
      v.rejectReason = reason || null;
      await v.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'seller_verification_reject',
        targetType: 'SellerVerification',
        targetId: req.params.id,
        overrideReason: reason || null,
        meta: { userId: String(v.userId) },
      });
      return reply.send({ ok: true, verification: v.toObject() });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/seller-verifications/:id/block', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    const { reason } = req.body ?? {};
    try {
      const v = await db.SellerVerification.findById(req.params.id);
      if (!v) return reply.status(404).send({ error: 'NOT_FOUND' });
      v.sellerStatus = 'blocked';
      await v.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'seller_verification_block',
        targetType: 'SellerVerification',
        targetId: req.params.id,
        overrideReason: reason || null,
        meta: { userId: String(v.userId), effectiveStatus: 'blocked' },
      });
      return reply.send({ ok: true, verification: v.toObject() });
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/admin/seller-verifications/:id/unblock-seller', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (admin.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    try {
      const v = await db.SellerVerification.findById(req.params.id);
      if (!v) return reply.status(404).send({ error: 'NOT_FOUND' });
      if (v.sellerStatus !== 'blocked') {
        return reply.status(400).send({ error: 'NOT_BLOCKED', sellerStatus: v.sellerStatus });
      }
      v.sellerStatus = v.status === 'approved' ? 'verified' : 'pending';
      await v.save();
      await writeAdminAuditLog({
        adminId: admin._id,
        action: 'seller_verification_unblock',
        targetType: 'SellerVerification',
        targetId: req.params.id,
        meta: { userId: String(v.userId), sellerStatus: v.sellerStatus },
      });
      return reply.send({ ok: true, verification: v.toObject() });
    } catch (e) {
      throw e;
    }
  });

  /* ── Store moderation & safety (suspend store, remove product, freeze payouts, audit seller) ── */
  app.post('/dashboards/admin/store/suspend', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { creatorId, reason } = req.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    const doc = await db.StorefrontCustomization.findOneAndUpdate(
      { creatorId },
      { $set: { storeSuspended: true, storeSuspendedAt: new Date(), storeSuspendedReason: (reason || '').slice(0, 500), storeSuspendedBy: admin._id } },
      { upsert: false, new: true }
    );
    if (!doc) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No storefront found for this creator.' });
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'store_suspend',
      targetType: 'seller',
      targetId: String(creatorId),
      overrideReason: reason || null,
      meta: { creatorId: String(creatorId) },
    });
    return reply.send({ ok: true, storeSuspended: true, creatorId: String(creatorId) });
  });

  app.post('/dashboards/admin/store/unsuspend', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { creatorId } = req.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    const doc = await db.StorefrontCustomization.findOneAndUpdate(
      { creatorId },
      { $set: { storeSuspended: false, storeSuspendedAt: null, storeSuspendedReason: null, storeSuspendedBy: null } },
      { new: true }
    );
    if (!doc) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No storefront found for this creator.' });
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'store_unsuspend',
      targetType: 'seller',
      targetId: String(creatorId),
      meta: { creatorId: String(creatorId) },
    });
    return reply.send({ ok: true, storeSuspended: false, creatorId: String(creatorId) });
  });

  app.post('/dashboards/admin/products/:id/remove', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.id, reply)) return;
    const { reason } = req.body ?? {};
    const product = await db.Product.findById(req.params.id);
    if (!product) return reply.status(404).send({ error: 'NOT_FOUND' });
    product.status = 'removed';
    if (product.meta && typeof product.meta === 'object') product.meta.removedByAdmin = String(admin._id);
    else product.meta = { removedByAdmin: String(admin._id) };
    if (reason) product.meta.removedReason = String(reason).slice(0, 500);
    await product.save();
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'product_remove',
      targetType: 'Product',
      targetId: String(product._id),
      overrideReason: reason || null,
      meta: { productId: String(product._id), creatorId: String(product.creatorId) },
    });
    return reply.send({ ok: true, product: product.toObject() });
  });

  app.post('/dashboards/admin/payouts/freeze', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { creatorId, reason } = req.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    const wallet = await db.CreatorWallet.findOneAndUpdate(
      { creatorId },
      { $set: { payoutFrozen: true, payoutFrozenAt: new Date(), payoutFrozenReason: (reason || '').slice(0, 500), payoutFrozenBy: admin._id } },
      { upsert: true, new: true }
    );
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'payout_freeze',
      targetType: 'seller',
      targetId: String(creatorId),
      overrideReason: reason || null,
      meta: { creatorId: String(creatorId) },
    });
    return reply.send({ ok: true, payoutFrozen: true, creatorId: String(creatorId) });
  });

  app.post('/dashboards/admin/payouts/unfreeze', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { creatorId } = req.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    const wallet = await db.CreatorWallet.findOneAndUpdate(
      { creatorId },
      { $set: { payoutFrozen: false, payoutFrozenAt: null, payoutFrozenReason: null, payoutFrozenBy: null } },
      { new: true }
    );
    if (!wallet) return reply.status(404).send({ error: 'NOT_FOUND', message: 'No creator wallet found.' });
    await writeAdminAuditLog({
      adminId: admin._id,
      action: 'payout_unfreeze',
      targetType: 'seller',
      targetId: String(creatorId),
      meta: { creatorId: String(creatorId) },
    });
    return reply.send({ ok: true, payoutFrozen: false, creatorId: String(creatorId) });
  });

  app.get('/dashboards/admin/sellers/:creatorId/activity', async (req, reply) => {
    const admin = await getRequestUser(req);
    if (!admin) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(admin, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const creatorId = req.params.creatorId;
    if (!creatorId || !validateId(creatorId, reply)) return;
    const limit = Math.min(Number(req.query?.limit) || 50, 100);
    const [auditLogs, ordersAsSeller, products, payoutRequests] = await Promise.all([
      db.AdminAuditLog.find({ $or: [{ targetType: 'seller', targetId: creatorId }, { 'meta.creatorId': creatorId }] })
        .sort({ createdAt: -1 }).limit(limit).lean(),
      db.Order.find({ 'items.creatorId': creatorId, status: 'paid' }).sort({ createdAt: -1 }).limit(limit).lean(),
      db.Product.find({ creatorId }).sort({ updatedAt: -1 }).limit(limit).lean(),
      db.PayoutRequest.find({ userId: creatorId }).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);
    const storefront = await db.StorefrontCustomization.findOne({ creatorId }).select('storeSuspended storeSuspendedAt storeSuspendedReason storeSlug').lean();
    const creatorWallet = await db.CreatorWallet.findOne({ creatorId }).select('payoutFrozen payoutFrozenAt payoutFrozenReason').lean();
    return reply.send({
      creatorId: String(creatorId),
      storeSuspended: storefront?.storeSuspended ?? false,
      storeSuspendedAt: storefront?.storeSuspendedAt ?? null,
      storeSlug: storefront?.storeSlug ?? null,
      payoutFrozen: creatorWallet?.payoutFrozen ?? false,
      payoutFrozenAt: creatorWallet?.payoutFrozenAt ?? null,
      auditLogs,
      ordersAsSeller: ordersAsSeller.map((o) => ({ _id: o._id, userId: o.userId, totalCents: o.totalCents, status: o.status, createdAt: o.createdAt })),
      products: products.map((p) => ({ _id: p._id, name: p.name, status: p.status, priceCents: p.priceCents, updatedAt: p.updatedAt })),
      payoutRequests: payoutRequests.map((pr) => ({ _id: pr._id, amountCents: pr.amountCents, status: pr.status, createdAt: pr.createdAt })),
    });
  });

  app.get('/dashboards/admin/financial-reconciliation', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { start, end, entries, limit = 50, offset = 0 } = req.query ?? {};
    const filter = {};
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }
    try {
      const byAction = await db.FinancialAuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$action', count: { $sum: 1 }, totalCents: { $sum: { $ifNull: ['$amountCents', 0] } } } },
        { $sort: { _id: 1 } },
      ]);
      const summary = byAction.reduce((acc, r) => {
        acc[r._id] = { count: r.count, totalCents: r.totalCents };
        return acc;
      }, {});
      const grandTotal = byAction.reduce((s, r) => s + (r.totalCents || 0), 0);
      const out = { ok: true, byAction: summary, grandTotalCents: grandTotal, filter: { start: start || null, end: end || null } };
      if (entries === '1' || entries === 'true') {
        const [entriesList, entriesTotal] = await Promise.all([
          db.FinancialAuditLog.find(filter).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 200)).lean(),
          db.FinancialAuditLog.countDocuments(filter),
        ]);
        out.entries = entriesList;
        out.entriesTotal = entriesTotal;
        out.entriesLimit = Number(limit);
        out.entriesOffset = Number(offset);
      }
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });

  /* ── Finance report (Phase 2): revenue, payouts, refunds, chargebacks, net income ── */
  app.get('/dashboards/admin/reports/finance', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { start, end } = req.query ?? {};
    const dateFilter = {};
    if (start || end) {
      dateFilter.createdAt = {};
      if (start) dateFilter.createdAt.$gte = new Date(start);
      if (end) dateFilter.createdAt.$lte = new Date(end);
    }
    try {
      const [revenueAgg, payoutAgg, refundAgg, chargebackAgg] = await Promise.all([
        db.PaymentTransaction.aggregate([
          { $match: { status: 'completed', ...dateFilter } },
          { $group: { _id: null, revenue: { $sum: { $ifNull: ['$grossAmountCents', 0] } }, platformRevenue: { $sum: { $ifNull: ['$platformFeeCents', 0] } } } },
        ]),
        db.PayoutRequest.aggregate([
          { $match: { status: { $in: ['completed', 'paid', 'approved'] }, ...dateFilter } },
          { $group: { _id: null, creatorPayouts: { $sum: { $ifNull: ['$amountCents', 0] } } } },
        ]),
        db.FinancialAuditLog.aggregate([
          { $match: { action: { $in: ['refund', 'stripe_refund', 'paypal_refund', 'payout_refund'] }, ...dateFilter } },
          { $group: { _id: null, refunds: { $sum: { $ifNull: ['$amountCents', 0] } } } },
        ]),
        db.Chargeback.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, chargebacks: { $sum: { $ifNull: ['$amountCents', 0] } }, lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, { $ifNull: ['$amountCents', 0] }, 0] } } } },
        ]),
      ]);
      const revenue = revenueAgg[0]?.revenue ?? 0;
      const platformRevenue = revenueAgg[0]?.platformRevenue ?? 0;
      const creatorPayouts = payoutAgg[0]?.creatorPayouts ?? 0;
      const refunds = Math.abs(refundAgg[0]?.refunds ?? 0);
      const chargebacks = chargebackAgg[0]?.chargebacks ?? 0;
      const chargebacksLost = chargebackAgg[0]?.lost ?? 0;
      const netIncome = platformRevenue - creatorPayouts - refunds - chargebacksLost;
      return reply.send({
        ok: true,
        revenue,
        platformRevenue,
        creatorPayouts,
        refunds,
        chargebacks,
        chargebacksLost,
        netIncome,
        filter: { start: start || null, end: end || null },
      });
    } catch (e) {
      throw e;
    }
  });

  app.get('/admin/reports/finance', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { start, end } = req.query ?? {};
    const dateFilter = {};
    if (start || end) {
      dateFilter.createdAt = {};
      if (start) dateFilter.createdAt.$gte = new Date(start);
      if (end) dateFilter.createdAt.$lte = new Date(end);
    }
    try {
      const [revenueAgg, payoutAgg, refundAgg, chargebackAgg] = await Promise.all([
        db.PaymentTransaction.aggregate([
          { $match: { status: 'completed', ...dateFilter } },
          { $group: { _id: null, revenue: { $sum: { $ifNull: ['$grossAmountCents', 0] } }, platformRevenue: { $sum: { $ifNull: ['$platformFeeCents', 0] } } } },
        ]),
        db.PayoutRequest.aggregate([
          { $match: { status: { $in: ['completed', 'paid', 'approved'] }, ...dateFilter } },
          { $group: { _id: null, creatorPayouts: { $sum: { $ifNull: ['$amountCents', 0] } } } },
        ]),
        db.FinancialAuditLog.aggregate([
          { $match: { action: { $in: ['refund', 'stripe_refund', 'paypal_refund', 'payout_refund'] }, ...dateFilter } },
          { $group: { _id: null, refunds: { $sum: { $ifNull: ['$amountCents', 0] } } } },
        ]),
        db.Chargeback.aggregate([
          { $match: dateFilter },
          { $group: { _id: null, chargebacks: { $sum: { $ifNull: ['$amountCents', 0] } }, lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, { $ifNull: ['$amountCents', 0] }, 0] } } } },
        ]),
      ]);
      const revenue = revenueAgg[0]?.revenue ?? 0;
      const platformRevenue = revenueAgg[0]?.platformRevenue ?? 0;
      const creatorPayouts = payoutAgg[0]?.creatorPayouts ?? 0;
      const refunds = Math.abs(refundAgg[0]?.refunds ?? 0);
      const chargebacks = chargebackAgg[0]?.chargebacks ?? 0;
      const chargebacksLost = chargebackAgg[0]?.lost ?? 0;
      const netIncome = platformRevenue - creatorPayouts - refunds - chargebacksLost;
      return reply.send({
        ok: true,
        revenue,
        platformRevenue,
        creatorPayouts,
        refunds,
        chargebacks,
        chargebacksLost,
        netIncome,
        filter: { start: start || null, end: end || null },
      });
    } catch (e) {
      throw e;
    }
  });

  /* ── Financial reconciliation report — payments vs payouts by currency ── */
  app.get('/dashboards/admin/reconciliation-report', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { start, end } = req.query ?? {};
    const filter = { status: 'completed' };
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }
    try {
      const paymentsByCurrency = await db.PaymentTransaction.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ['$currency', 'USD'] } },
            totalVolumeCents: { $sum: { $ifNull: ['$grossAmountCents', 0] } },
            platformRevenueCents: { $sum: { $ifNull: ['$platformFeeCents', 0] } },
            creatorPayoutCents: { $sum: { $ifNull: ['$creatorAmountCents', 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      const payoutFilter = {};
      if (start || end) {
        payoutFilter.createdAt = {};
        if (start) payoutFilter.createdAt.$gte = new Date(start);
        if (end) payoutFilter.createdAt.$lte = new Date(end);
      }
      const payoutsByCurrency = await db.PayoutRequest.aggregate([
        { $match: { ...payoutFilter, status: { $in: ['completed', 'paid', 'approved'] } } },
        {
          $group: {
            _id: { $toUpper: { $ifNull: ['$currency', 'USD'] } },
            totalPayoutCents: { $sum: { $ifNull: ['$amountCents', 0] } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      const currencySet = new Set([
        ...paymentsByCurrency.map((p) => (p._id || 'USD').toUpperCase()),
        ...payoutsByCurrency.map((po) => (po._id || 'USD').toUpperCase()),
      ]);
      const report = [...currencySet].sort().map((currency) => {
        const p = paymentsByCurrency.find((x) => (x._id || 'USD').toUpperCase() === currency);
        const po = payoutsByCurrency.find((x) => (x._id || 'USD').toUpperCase() === currency);
        return {
          currency,
          totalVolumeCents: p?.totalVolumeCents ?? 0,
          platformRevenueCents: p?.platformRevenueCents ?? 0,
          creatorPayoutCents: p?.creatorPayoutCents ?? 0,
          paymentCount: p?.count ?? 0,
          actualPayoutsCents: po?.totalPayoutCents ?? 0,
          payoutCount: po?.count ?? 0,
        };
      });
      return reply.send({
        ok: true,
        report,
        filter: { start: start || null, end: end || null },
      });
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/admin/retention-purge', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const out = await compliance.purgeAllExpiredAuditData();
      await writeAdminAuditLog({
        adminId: user._id,
        action:  'retention_purge',
        meta:    out,
      });
      return reply.send(out);
    } catch (e) {
      throw e;
    }
  });

  /* ── Admin: generic payment lookup/search ── */
  app.get('/dashboards/admin/payments/search', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { userId, creatorId, amountMin, amountMax, start, end, action, limit = 50, offset = 0 } = req.query ?? {};
    const filter = {};
    if (userId && validateId(userId, () => {})) filter.actorId = userId;
    if (start || end) {
      filter.createdAt = {};
      if (start) filter.createdAt.$gte = new Date(start);
      if (end) filter.createdAt.$lte = new Date(end);
    }
    if (amountMin != null || amountMax != null) {
      filter.amountCents = {};
      if (amountMin != null) filter.amountCents.$gte = Number(amountMin);
      if (amountMax != null) filter.amountCents.$lte = Number(amountMax);
    }
    if (action) filter.action = action;
    if (creatorId && validateId(creatorId, () => {})) filter['meta.creatorId'] = creatorId;
    const lim = Math.min(Number(limit) || 50, 200);
    const off = Math.max(0, Number(offset) || 0);
    try {
      const [entries, total] = await Promise.all([
        db.FinancialAuditLog.find(filter).sort({ createdAt: -1 }).skip(off).limit(lim).lean(),
        db.FinancialAuditLog.countDocuments(filter),
      ]);
      return reply.send({ ok: true, entries, total, limit: lim, offset: off });
    } catch (e) {
      throw e;
    }
  });

  /* ── Queue dashboard (BullMQ: worker jobs, failed, retries) ── */
  app.get('/dashboards/admin/queues', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { getQueueDashboard } = require('./metrics');
    const queues = await getQueueDashboard();
    return reply.send({ queues });
  });
  app.get('/admin/queues', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { getQueueDashboard } = require('./metrics');
    const queues = await getQueueDashboard();
    return reply.send({ queues });
  });

  /* ── Observability: admin metrics JSON (Prometheus scrape = GET /metrics; Grafana → Prometheus; Sentry optional) ── */
  const adminMetrics = require('./metrics');
  const adminMetricsGuard = async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const canView = dashboards.hasRole(user, 'admin') || dashboards.hasRole(user, 'ops');
    if (!canView) return reply.status(403).send({ error: 'FORBIDDEN' });
    return user;
  };
  /* PATCH 18 — Admin metrics API: queue backlog + live streams + payment counters */
  app.get('/dashboards/admin/metrics', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsSummary());
  });
  app.get('/admin/metrics', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsSummary());
  });
  app.get('/dashboards/admin/metrics/queues', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsQueues());
  });
  app.get('/admin/metrics/queues', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsQueues());
  });
  app.get('/dashboards/admin/metrics/payments', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsPayments());
  });
  app.get('/admin/metrics/payments', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsPayments());
  });
  app.get('/dashboards/admin/metrics/live', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsLive());
  });
  app.get('/admin/metrics/live', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsLive());
  });
  app.get('/dashboards/admin/metrics/system', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsSystem());
  });
  app.get('/admin/metrics/system', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsSystem());
  });
  app.get('/dashboards/admin/metrics/observability', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsObservability());
  });
  app.get('/admin/metrics/observability', async (req, reply) => {
    if (!(await adminMetricsGuard(req, reply))) return;
    return reply.send(await adminMetrics.getAdminMetricsObservability());
  });

  // Moderator
  app.post('/dashboards/mod/live-moderation', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.liveModeration(user, req.body?.streamId, req.body?.action, req.body?.meta || {});
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.post('/dashboards/mod/abuse-review', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.abuseReview(user, req.body?.reportId, req.body?.action, req.body?.meta || {});
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'REPORT_NOT_PENDING' || e.message === 'INVALID_ABUSE_ACTION') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });
  app.get('/dashboards/mod/abuse-queue', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const reports = await dashboards.abuseQueue(user, req.query?.status, Number(req.query?.limit) || 50);
      return reply.send(reports);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.get('/dashboards/mod/appeals', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const appeals = await dashboards.appealList(user, req.query?.status, Number(req.query?.limit) || 50);
      return reply.send(appeals);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.post('/dashboards/mod/appeals/:appealId/resolve', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.resolveAppeal(user, req.params.appealId, req.body?.decision, req.body?.reason);
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'APPEAL_NOT_PENDING' || e.message === 'INVALID_DECISION') return reply.status(400).send({ error: e.message });
      throw e;
    }
  });
  app.post('/dashboards/mod/shadow-ban', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { userId, shadowBanned } = req.body ?? {};
    if (!userId) return reply.status(400).send({ error: 'USER_ID_REQUIRED' });
    if (!validateId(userId, reply)) return;
    try {
      const out = await dashboards.setShadowBan(user, userId, shadowBanned, req.body?.reason, req.body?.expiresAt);
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'PROFILE_NOT_FOUND') return reply.status(404).send({ error: 'PROFILE_NOT_FOUND' });
      throw e;
    }
  });

  // Support (only support/admin can view and respond to tickets)
  app.post('/dashboards/support/tickets', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const subject = req.body?.subject;
      if (!subject?.trim()) return reply.status(400).send({ error: 'SUBJECT_REQUIRED' });
      if (subject.trim().length > 200) return reply.status(400).send({ error: 'SUBJECT_TOO_LONG', message: 'Subject must be 200 characters or fewer' });
      const ticket = await dashboards.ticketCreate(user, req.body?.userId, subject.trim(), req.body?.message, {
        orderId: req.body?.orderId,
        paymentId: req.body?.paymentId,
      });
      return reply.send(ticket);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'USER_NOT_FOUND') return reply.status(404).send({ error: 'USER_NOT_FOUND' });
      if (e.message === 'ORDER_NOT_FOUND' || e.message === 'PAYMENT_NOT_FOUND') {
        return reply.status(404).send({ error: e.message });
      }
      if (
        e.message === 'ORDER_USER_MISMATCH' ||
        e.message === 'PAYMENT_USER_MISMATCH' ||
        e.message === 'INVALID_ORDER_ID' ||
        e.message === 'INVALID_PAYMENT_ID'
      ) {
        return reply.status(400).send({ error: e.message });
      }
      if (e.message === 'INVALID_USER_ID' || e.message === 'USER_ID_REQUIRED') {
        return reply.status(400).send({ error: e.message });
      }
      throw e;
    }
  });
  app.get('/dashboards/support/tickets', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const tickets = await dashboards.ticketList(user, req.query?.status, Number(req.query?.limit) || 50);
      return reply.send(tickets);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.post('/dashboards/support/tickets/:id/respond', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(req.params.id, reply)) return;
    const response = req.body?.response;
    try {
      const ticket = await dashboards.ticketRespond(user, req.params.id, response);
      return reply.send(ticket);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'TICKET_NOT_FOUND') return reply.status(404).send({ error: 'TICKET_NOT_FOUND' });
      if (e.message === 'RESPONSE_REQUIRED') return reply.status(400).send({ error: 'RESPONSE_REQUIRED', message: 'Response text is required' });
      throw e;
    }
  });
  app.post('/dashboards/support/refund', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.refundHandling(user, req.body?.userId, req.body?.amountCents, req.body?.reason);
      await writeAdminAuditLog({
        adminId: user._id,
        action:  'support_refund',
        targetId: req.body?.userId || null,
        meta: {
          amountCents: req.body?.amountCents,
          reason:      req.body?.reason,
        },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      throw e;
    }
  });
  app.get('/dashboards/support/payment-lookup', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(user, 'support') && !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const { userId, email, limit = 20 } = req.query ?? {};
    let targetUserId = userId;
    if (!targetUserId && email) {
      const u = await db.User.findOne({ email: String(email).toLowerCase().trim() }).lean();
      if (!u) return reply.send({ ok: true, orders: [], payouts: [], message: 'No user found for email' });
      targetUserId = u._id;
    }
    if (!targetUserId) return reply.status(400).send({ error: 'USER_ID_OR_EMAIL_REQUIRED' });
    if (!validateId(targetUserId, reply)) return;
    const lim = Math.min(Number(limit) || 20, 50);
    try {
      const [orders, payouts] = await Promise.all([
        db.Order.find({ userId: targetUserId }).sort({ createdAt: -1 }).limit(lim).lean(),
        db.PayoutRequest.find({ userId: targetUserId }).sort({ createdAt: -1 }).limit(lim).lean(),
      ]);
      return reply.send({ ok: true, userId: String(targetUserId), orders, payouts });
    } catch (e) {
      throw e;
    }
  });

  app.post('/dashboards/support/user-tools', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    try {
      const out = await dashboards.userAccountTools(user, req.body?.action, req.body?.payload || {});
      await writeAdminAuditLog({
        adminId: user._id,
        action:  `user_tools_${req.body?.action || 'unknown'}`,
        targetId: req.body?.payload?.userId || null,
        meta: {
          action:  req.body?.action,
          payload: req.body?.payload,
        },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'USER_NOT_FOUND') return reply.status(404).send({ error: e.message });
      throw e;
    }
  });

  /* ── Branding ── */
  app.get('/dashboards/admin/branding', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const saved = await readSettings(BRANDING_KEYS);
      const defaults = branding.DEFAULTS;
      return reply.send({
        logoUrl:      saved.logoUrl      ?? branding.getLogoUrl(),
        appName:      saved.appName      ?? branding.getAppName(),
        appUrl:       saved.appUrl       ?? branding.getAppUrl(),
        accentColor:  saved.accentColor  ?? branding.getAccentColor(),
        supportEmail: saved.supportEmail ?? branding.getSupportEmail(),
      });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/branding', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const body = req.body || {};
    const patch = {};
    for (const k of BRANDING_KEYS) {
      if (body[k] != null) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'No valid fields' });
    try {
      await writeSettings(patch, String(user._id));
      branding.applySettings(patch);
      await writeAdminAuditLog({
        adminId: user._id, action: 'branding_update', meta: { fields: Object.keys(patch) },
      });
      return reply.send({ ok: true, applied: patch });
    } catch (e) { throw e; }
  });

  /* Live email preview — returns rendered HTML */
  app.post('/dashboards/admin/branding/email-preview', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { logoUrl, appName, accentColor } = req.body || {};
    const lo  = logoUrl     || branding.getLogoUrl();
    const an  = appName     || branding.getAppName();
    const ac  = accentColor || branding.getAccentColor();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc;color:#1e293b}
      .container{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
      .logo img{max-height:48px;width:auto;margin-bottom:24px;display:block}
      h1{font-size:20px;margin:0 0 12px}
      .body{color:#475569;line-height:1.6;margin-bottom:24px}
      .cta{display:inline-block;padding:12px 24px;background:${ac};color:#fff;text-decoration:none;border-radius:8px;font-weight:600}
      .footer{margin-top:32px;font-size:12px;color:#94a3b8}
    </style></head><body><div class="container">
      <div class="logo"><img src="${lo}" alt="${an}" width="140" height="48" onerror="this.style.display='none';this.parentElement.innerHTML='<span style=font-weight:900;font-size:22px;color:${ac}>${an}</span>'" /></div>
      <h1>Welcome to ${an}! 🎉</h1>
      <div class="body">Thanks for joining ${an}. Your account is ready — start exploring live streams, virtual gifts, and exclusive creator content.</div>
      <a href="#" class="cta">Get Started</a>
      <p class="footer">&copy; ${new Date().getFullYear()} ${an}. All rights reserved.</p>
    </div></body></html>`;
    reply.header('Content-Type', 'text/html');
    return reply.send(html);
  });

  /* ── Notification settings ── */
  app.get('/dashboards/admin/notifications/settings', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const saved = await readSettings(NOTIF_KEYS);
      return reply.send({
        emailTypes: saved.emailTypes ?? { welcome: true, purchase: true, payout: true, security: true, marketing: false },
        pushTypes:  saved.pushTypes  ?? { newFollower: true, newGift: true, liveStart: true, message: true },
      });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/notifications/settings', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const body = req.body || {};
    const patch = {};
    for (const k of NOTIF_KEYS) {
      if (body[k] != null) patch[k] = body[k];
    }
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'No valid fields' });
    try {
      await writeSettings(patch, String(user._id));
      await writeAdminAuditLog({
        adminId: user._id, action: 'notification_settings_update', meta: { fields: Object.keys(patch) },
      });
      return reply.send({ ok: true, applied: patch });
    } catch (e) { throw e; }
  });

  /* ── AI shadow toggle (admin) — same setting as PATCH /admin/moderation/shadow-mode (key: ai_shadow_mode) ── */
  const AI_SHADOW_MODE_KEY = 'ai_shadow_mode';
  app.get('/dashboards/admin/ai-shadow-enabled', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const [doc] = await PlatformSettings.find({ key: AI_SHADOW_MODE_KEY }).limit(1).lean();
      const ai_shadow_mode = doc?.value === true;
      return reply.send({ ai_shadow_mode, ai_shadow_enabled: ai_shadow_mode });
    } catch (e) { throw e; }
  });

  app.post('/dashboards/admin/ai-shadow-enabled', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const enabled = req.body?.enabled === true;
    try {
      await writeSettings({ [AI_SHADOW_MODE_KEY]: enabled }, String(user._id));
      await writeAdminAuditLog({
        adminId: user._id, action: 'ai_shadow_toggle', meta: { ai_shadow_mode: enabled },
      });
      return reply.send({ ok: true, ai_shadow_mode: enabled, ai_shadow_enabled: enabled });
    } catch (e) { throw e; }
  });

  /* ── Phase 11: Support tools — report short API (admin/support) ── */
  app.get('/admin/reports/shorts', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(user, 'support') && !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    const status = String(req.query?.status || '').trim();
    const limit = Math.min(Number(req.query?.limit) || 50, 100);
    const offset = Math.max(0, Number(req.query?.offset) || 0);
    const query = { targetType: 'stream' };
    if (status) query.status = status;
    const [reports, total] = await Promise.all([
      db.Report.find(query).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
      db.Report.countDocuments(query),
    ]);
    return reply.send({ reports, total, limit, offset });
  });

  app.post('/admin/reports/shorts/:videoId', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!dashboards.hasRole(user, 'support') && !dashboards.hasRole(user, 'admin')) return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(req.params.videoId, reply)) return;
    const { reason, description = '', reporterId } = req.body || {};
    const validReasons = ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'];
    if (!reason || !validReasons.includes(reason)) return reply.status(400).send({ error: 'INVALID_REASON', valid: validReasons });
    const stream = await db.LiveStream.findById(req.params.videoId).lean();
    if (!stream) return reply.status(404).send({ error: 'VIDEO_NOT_FOUND' });
    if (reporterId && !validateId(reporterId, reply)) return;
    const reporter = reporterId || user._id;
    const report = await db.Report.create({
      reporterId: reporter,
      targetType: 'stream',
      targetId: req.params.videoId,
      reason,
      description: String(description).slice(0, 2000),
      status: 'open',
    });
    await writeAdminAuditLog({
      adminId: user._id,
      action: 'short_report_create',
      targetType: 'Report',
      targetId: String(report._id),
      meta: { videoId: req.params.videoId, reason, reporterId: String(reporter) },
    });
    return reply.status(201).send({ ok: true, reportId: report._id });
  });

  /* Send test email */
  app.post('/dashboards/admin/notifications/test-email', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!getCapabilities().notifications.email) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CAPABLE',
        message: 'Real email delivery is disabled. Set a non-console EMAIL_PROVIDER and required provider credentials.',
      });
    }
    const { to, subject } = req.body || {};
    if (!to) return reply.status(400).send({ error: 'Recipient email required' });
    try {
      const result = await sendCustomerEmail({
        template: 'admin_test_email',
        to,
        subject: subject || `Test email from ${branding.getAppName()}`,
        title:   `Test email from ${branding.getAppName()}`,
        body:    'This is a test email sent from the admin dashboard. If you received this, your email configuration is working correctly.',
        ctaUrl:  branding.getAppUrl(),
        ctaText: 'Visit site',
        userId: user._id,
      });
      if (result && result.skipped) {
        return reply.status(503).send({
          error: 'EMAIL_NOT_CAPABLE',
          message: 'Real email delivery is disabled (capabilities.notifications.email is false).',
        });
      }
      if (!result || !result.ok) {
        return reply.status(502).send({ ok: false, result });
      }
      return reply.send({ ok: true, result });
    } catch (e) { throw e; }
  });

  /* ── Users (admin tools): POST …/action — list/single user use GET /dashboards/admin/users above ── */
  app.post('/dashboards/admin/users/:userId/action', async (req, reply) => {
    if (!validateId(req.params.userId, reply)) return;
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    try {
      const out = await dashboards.userAccountTools(user, req.body?.action, {
        userId: req.params.userId,
        ...(req.body?.payload || {}),
      });
      await writeAdminAuditLog({
        adminId:  user._id,
        action:   `user_${req.body?.action || 'action'}`,
        targetId: req.params.userId,
        meta:     { payload: req.body?.payload },
      });
      return reply.send(out);
    } catch (e) {
      if (e.message === 'FORBIDDEN') return reply.status(403).send({ error: 'FORBIDDEN' });
      if (e.message === 'USER_NOT_FOUND') return reply.status(404).send({ error: e.message });
      if (e.message === 'USER_BANNED') {
        return reply.status(400).send({
          error: 'USER_BANNED',
          message: 'Account is banned; use unban to reinstate.',
        });
      }
      if (e.message === 'UNKNOWN_ACTION') return reply.status(400).send({ error: 'UNKNOWN_ACTION' });
      throw e;
    }
  });

  /* ── Admin real KPI analytics ── */
  app.get('/dashboards/admin/analytics', async (req, reply) => {
    const user = await getRequestUser(req);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });

    const now  = new Date();
    const d30  = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const d7   = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d1   = new Date(now - 24 * 60 * 60 * 1000);
    const prevD30 = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsers30d, prevNewUsers30d,
      activeStreams, totalStreams,
      totalRevenue, prevRevenue,
      totalFollows,
      revenueByDay,
      revenueBySource,
      recentTxs,
      topCreators,
      liveNow,
      pendingPayouts,
      pendingReports,
      pendingApplications,
    ] = await Promise.all([
      db.User.countDocuments({}).catch(() => 0),
      db.User.countDocuments({ createdAt: { $gte: d30 } }).catch(() => 0),
      db.User.countDocuments({ createdAt: { $gte: prevD30, $lt: d30 } }).catch(() => 0),
      db.LiveStream.countDocuments({ status: 'live' }).catch(() => 0),
      db.LiveStream.countDocuments({}).catch(() => 0),
      db.LedgerEntry.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: d30 } } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]).catch(() => []),
      db.LedgerEntry.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: prevD30, $lt: d30 } } },
        { $group: { _id: null, total: { $sum: '$amountCents' } } },
      ]).catch(() => []),
      db.Follow.countDocuments({}).catch(() => 0),
      db.LedgerEntry.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: d30 } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amountCents' } } },
        { $sort: { _id: 1 } },
      ]).catch(() => []),
      // Revenue by source type
      db.LedgerEntry.aggregate([
        { $match: { createdAt: { $gte: d30 } } },
        { $group: { _id: '$type', total: { $sum: '$amountCents' } } },
      ]).catch(() => []),
      db.LedgerEntry.find({ type: 'credit', createdAt: { $gte: d7 } })
        .sort({ createdAt: -1 }).limit(10).lean().catch(() => []),
      db.LedgerEntry.aggregate([
        { $match: { type: 'credit', createdAt: { $gte: d30 } } },
        { $group: { _id: '$userId', revenue: { $sum: '$amountCents' } } },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]).catch(() => []),
      db.LiveStream.find({ status: 'live' }).limit(10).lean().catch(() => []),
      // Actionable pending items for the Tasks panel
      db.PayoutRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
      db.Report.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
      db.CreatorApplication.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).lean().catch(() => []),
    ]);

    const rev30d     = totalRevenue[0]?.total  ?? 0;
    const revPrev30d = prevRevenue[0]?.total    ?? 0;
    const revChange  = revPrev30d > 0 ? (((rev30d - revPrev30d) / revPrev30d) * 100).toFixed(1) + '%' : 'N/A';
    const userChange = prevNewUsers30d > 0 ? (((newUsers30d - prevNewUsers30d) / prevNewUsers30d) * 100).toFixed(1) + '%' : 'N/A';

    // Build 30-day revenue chart
    const revenueMap = {};
    for (const r of revenueByDay) revenueMap[r._id] = r.revenue;
    const revenueChart = Array.from({ length: 30 }, (_, i) => {
      const d   = new Date(d30.getTime() + i * 86400000);
      const day = d.toISOString().slice(0, 10);
      return { date: day, label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), revenue: revenueMap[day] || 0 };
    });

    // Build category breakdown from ledger entry types
    const sourceMap = { gift: 0, coin_purchase: 0, subscription: 0, ad: 0 };
    for (const s of revenueBySource) {
      const t = String(s._id || '').toLowerCase();
      if (t.includes('gift') || t.includes('debit'))        sourceMap.gift         += s.total;
      else if (t.includes('coin') || t.includes('purchase')) sourceMap.coin_purchase += s.total;
      else if (t.includes('sub'))                            sourceMap.subscription  += s.total;
      else if (t.includes('ad'))                             sourceMap.ad            += s.total;
    }
    const catTotal = Object.values(sourceMap).reduce((a, b) => a + b, 0) || 1;
    const categoryBreakdown = [
      { name: 'Gifts',         value: Math.round((sourceMap.gift / catTotal) * 100),          color: '#7c3aed' },
      { name: 'Coins',         value: Math.round((sourceMap.coin_purchase / catTotal) * 100), color: '#2563eb' },
      { name: 'Subscriptions', value: Math.round((sourceMap.subscription / catTotal) * 100),  color: '#0d9488' },
      { name: 'Ads',           value: Math.round((sourceMap.ad / catTotal) * 100),            color: '#cbd5e1' },
    ];

    // Build real tasks from pending platform actions
    let taskId = 0;
    const tasks = [
      ...pendingReports.map((r) => ({
        id:       ++taskId,
        title:    `Review report: ${r.reason || r.contentType || 'content'}`,
        category: 'Moderation',
        assignee: 'Mod Team',
        status:   'Open',
        priority: 'High',
        link:     `/admin?view=moderation`,
      })),
      ...pendingPayouts.map((p) => ({
        id:       ++taskId,
        title:    `Approve payout — $${((p.amountCents || 0) / 100).toFixed(2)} via ${p.provider || 'unknown'}`,
        category: 'Finance',
        assignee: 'Finance Team',
        status:   'Open',
        priority: 'High',
        link:     `/admin?view=payouts`,
      })),
      ...pendingApplications.map((a) => ({
        id:       ++taskId,
        title:    `Review creator application`,
        category: 'Creators',
        assignee: 'Admin',
        status:   'Open',
        priority: 'Medium',
        link:     `/admin?view=creators`,
      })),
    ];

    return reply.send({
      kpis: [
        { label: 'Total Users',    value: totalUsers.toLocaleString(),       change: `+${newUsers30d} this month`,  changeRaw: userChange },
        { label: 'Revenue (30d)',  value: '$' + (rev30d / 100).toFixed(2),   change: revChange + ' vs prev period', changeRaw: revChange },
        { label: 'Live Streams',   value: activeStreams.toLocaleString(),     change: `${totalStreams} total ever`,   changeRaw: null },
        { label: 'Follows',        value: totalFollows.toLocaleString(),      change: 'All time',                    changeRaw: null },
      ],
      categoryBreakdown,
      tasks,
      revenueChart,
      recentTransactions: recentTxs.map((t) => ({
        id:       String(t._id).slice(-6).toUpperCase(),
        userId:   String(t.userId),
        date:     new Date(t.createdAt).toLocaleDateString(),
        amount:   '$' + ((t.amountCents || 0) / 100).toFixed(2),
        type:     t.meta?.giftId ? `Gift: ${t.meta.giftId}` : 'Credit',
      })),
      topCreators: topCreators.map((c, i) => ({
        rank:    i + 1,
        userId:  String(c._id),
        revenue: '$' + (c.revenue / 100).toFixed(2),
      })),
      liveNow: liveNow.map((s) => ({
        id:      String(s._id),
        title:   s.title,
        viewers: s.meta?.viewerCount ?? 0,
      })),
    });
  });
}

module.exports = { dashboardsRoutes };
