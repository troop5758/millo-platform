'use strict';
/**
 * Ledger hardening — distributed locks + universal payment DTO.
 * Delegates locking to lib/withRedisLock (SET NX PX + safe release).
 * Universal lookup: **MoneyIndex** (single collection) first, then PaymentReference, LedgerEntry, Order,
 * PayoutRequest, Chargeback, PaymentTransaction (_id), Dispute, PpvPurchase, IdempotencyRecord (legacy fallbacks).
 * https://milloapp.com
 */

const mongoose = require('mongoose');
const db = require('@millo/database');
const { withRedisLock, LockContentionError } = require('../lib/withRedisLock');
const paymentReferenceService = require('./paymentReferenceService');

const DEFAULT_LOCK_TTL_MS = Math.min(Math.max(Number(process.env.LEDGER_LOCK_TTL_MS) || 5000, 1000), 120_000);

/**
 * Write-through to MoneyIndex when a legacy collection still holds the row (fills index for next single-collection lookup).
 * @param {{ kind: string, doc: object }} hit
 */
async function backfillMoneyIndexFromHit(hit) {
  if (!hit?.kind || !hit.doc) return;
  const k = hit.kind;
  if (k === 'money_index' || k === 'idempotency_record' || k === 'dispute' || k === 'ledger_entry' || k === 'ppv_purchase') {
    return;
  }
  try {
    const economy = require('@millo/economy');
    if (k === 'payment_reference') await economy.upsertFromPaymentReferenceRow(hit.doc);
    else if (k === 'payment_transaction') await economy.upsertFromPaymentTransaction(hit.doc);
    else if (k === 'payout_request') await economy.upsertFromPayoutRequest(hit.doc);
    else if (k === 'chargeback') await economy.upsertFromChargeback(hit.doc);
    else if (k === 'order') await economy.upsertFromOrder(hit.doc);
  } catch {
    /* non-fatal */
  }
}

function sanitizeLockSegment(key) {
  return String(key || '')
    .replace(/^lock:/gi, '')
    .replace(/\s+/g, '')
    .slice(0, 200);
}

/**
 * Run fn while holding a Redis lock. Key is namespaced under `ledger:`.
 * @param {string} key - logical key (e.g. wallet:credit:userId)
 * @param {() => Promise<T>} fn
 * @param {number} [ttlMs] - lock TTL (default LEDGER_LOCK_TTL_MS or 5000)
 * @returns {Promise<T>}
 */
async function withLock(key, fn, ttlMs = DEFAULT_LOCK_TTL_MS) {
  const logical = `ledger:${sanitizeLockSegment(key)}`;
  const ms = Math.min(Math.max(Number(ttlMs) || DEFAULT_LOCK_TTL_MS, 1000), 120_000);
  const { result } = await withRedisLock(logical, ms, fn);
  return result;
}

const STATUS_UNIVERSAL = {
  pending: 'PENDING',
  processing: 'PENDING',
  approved: 'PENDING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  refunded: 'REFUNDED',
  paid: 'COMPLETED',
  shipped: 'COMPLETED',
  delivered: 'COMPLETED',
  cancelled: 'FAILED',
  canceled: 'FAILED',
  pending_payment: 'PENDING',
  rejected: 'FAILED',
  open: 'PENDING',
  won: 'COMPLETED',
  lost: 'FAILED',
  warning_closed: 'COMPLETED',
};

function orderToNormStatus(raw) {
  const s = STATUS_UNIVERSAL[String(raw || '').toLowerCase()];
  const norm = s || String(raw || 'pending').toUpperCase();
  return String(norm).toLowerCase();
}

/**
 * @param {{ kind: string, doc: object }|null} hit
 * @returns {{ id: string, provider: string, providerId: string, status: string, source: string, userId?: string|null, amountCents?: number|null, currency?: string|null, createdAt?: Date, updatedAt?: Date, reference?: string }|null}
 */
function toUniversalPayment(hit) {
  if (!hit || !hit.kind || !hit.doc) return null;
  if (hit.kind === 'payment_reference') {
    const payment = hit.doc;
    const raw = payment.status || 'pending';
    const status = String(STATUS_UNIVERSAL[raw] || raw || 'pending').toLowerCase();
    return {
      id: String(payment._id),
      provider: payment.provider,
      providerId: payment.referenceId,
      reference: payment.referenceId,
      status,
      source: 'payment_reference',
      userId: payment.userId != null ? String(payment.userId) : null,
      amountCents: payment.amountCents != null ? Number(payment.amountCents) : null,
      currency: payment.currency || 'USD',
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
  if (hit.kind === 'ledger_entry') {
    const le = hit.doc;
    const providerId =
      (le.refId && String(le.refId).trim()) ||
      (le.meta && le.meta.paymentIntentId && String(le.meta.paymentIntentId)) ||
      (le.meta && le.meta.referenceId && String(le.meta.referenceId)) ||
      String(le._id);
    return {
      id: String(le._id),
      provider: 'ledger',
      providerId,
      reference: providerId,
      status: 'completed',
      source: 'ledger_entry',
      userId: le.actorId != null ? String(le.actorId) : null,
      amountCents: le.amountCents != null ? Number(le.amountCents) : null,
      currency: 'USD',
      createdAt: le.createdAt,
      updatedAt: le.updatedAt,
      refType: le.refType || null,
    };
  }
  if (hit.kind === 'order') {
    const o = hit.doc;
    const providerId = o.stripeSessionId ? String(o.stripeSessionId) : `order:${String(o._id)}`;
    return {
      id: String(o._id),
      provider: 'order',
      providerId,
      reference: providerId,
      status: orderToNormStatus(o.status),
      source: 'order',
      userId: o.userId != null ? String(o.userId) : null,
      amountCents: o.totalCents != null ? Number(o.totalCents) : null,
      currency: 'USD',
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }
  if (hit.kind === 'payout_request') {
    const p = hit.doc;
    const raw = p.status || 'pending';
    const status = String(STATUS_UNIVERSAL[raw] || raw || 'pending').toLowerCase();
    const providerId =
      (p.externalId && String(p.externalId).trim()) ||
      (p.idempotencyKey && String(p.idempotencyKey).trim()) ||
      String(p._id);
    return {
      id: String(p._id),
      provider: p.provider || 'payout',
      providerId,
      reference: providerId,
      status,
      source: 'payout_request',
      userId: p.userId != null ? String(p.userId) : null,
      amountCents: p.amountCents != null ? Number(p.amountCents) : null,
      currency: p.currency || 'USD',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
  if (hit.kind === 'chargeback') {
    const c = hit.doc;
    const raw = c.status || 'open';
    const status = String(STATUS_UNIVERSAL[String(raw || '').toLowerCase()] || raw || 'open').toLowerCase();
    const providerId = (c.stripeDisputeId && String(c.stripeDisputeId).trim()) || String(c._id);
    return {
      id: String(c._id),
      provider: 'stripe',
      providerId,
      reference: providerId,
      status,
      source: 'chargeback',
      userId: c.userId != null ? String(c.userId) : null,
      amountCents: c.amountCents != null ? Number(c.amountCents) : null,
      currency: (c.currency || 'usd').toUpperCase(),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      refType: c.refType || null,
      refId: c.refId || null,
    };
  }
  if (hit.kind === 'payment_transaction') {
    const tx = hit.doc;
    const raw = tx.status || 'completed';
    const status = String(STATUS_UNIVERSAL[String(raw || '').toLowerCase()] || raw || 'completed').toLowerCase();
    return {
      id: String(tx._id),
      provider: tx.paymentProcessor || 'internal',
      providerId: String(tx._id),
      reference: String(tx._id),
      status,
      source: 'payment_transaction',
      userId: tx.userId != null ? String(tx.userId) : null,
      amountCents: tx.grossAmountCents != null ? Number(tx.grossAmountCents) : null,
      currency: tx.currency || 'USD',
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      transactionType: tx.type || null,
    };
  }
  if (hit.kind === 'dispute') {
    const d = hit.doc;
    const raw = String(d.status || 'open').toLowerCase();
    const mapped =
      raw === 'resolved' ? 'completed' : raw === 'open' || raw === 'investigating' ? 'pending' : null;
    const status = String(mapped || STATUS_UNIVERSAL[raw] || 'pending').toLowerCase();
    return {
      id: String(d._id),
      provider: 'marketplace',
      providerId: String(d._id),
      reference: d.transactionId != null ? String(d.transactionId) : String(d._id),
      status,
      source: 'dispute',
      userId: d.userId != null ? String(d.userId) : null,
      amountCents: d.meta?.amountCents != null ? Number(d.meta.amountCents) : null,
      currency: d.meta?.currency || null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      refType: 'transaction',
      refId: d.transactionId != null ? String(d.transactionId) : null,
    };
  }
  if (hit.kind === 'ppv_purchase') {
    const p = hit.doc;
    const metaPi =
      (p.meta && p.meta.paymentIntentId && String(p.meta.paymentIntentId).trim()) ||
      (p.meta && p.meta.stripeSessionId && String(p.meta.stripeSessionId).trim()) ||
      null;
    return {
      id: String(p._id),
      provider: (p.meta && p.meta.paymentProcessor && String(p.meta.paymentProcessor)) || 'ppv',
      providerId: metaPi || String(p._id),
      reference: String(p._id),
      status: 'completed',
      source: 'ppv_purchase',
      userId: p.userId != null ? String(p.userId) : null,
      amountCents: p.amountCents != null ? Number(p.amountCents) : null,
      currency: 'USD',
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
  if (hit.kind === 'money_index') {
    const m = hit.doc;
    const raw = m.status || 'pending';
    const status = String(STATUS_UNIVERSAL[String(raw).toLowerCase()] || raw || 'pending').toLowerCase();
    return {
      id: String(m._id),
      provider: m.provider,
      providerId: m.providerId,
      reference: m.refId,
      refId: m.refId,
      status,
      source: 'money_index',
      userId: m.userId != null ? String(m.userId) : null,
      amountCents: m.amountCents != null ? Number(m.amountCents) : null,
      currency: m.currency || 'USD',
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      moneyType: m.type,
    };
  }
  if (hit.kind === 'idempotency_record') {
    const r = hit.doc;
    const st = r.status === 'failed' ? 'failed' : 'completed';
    return {
      id: String(r._id),
      provider: 'idempotency',
      providerId: String(r.key),
      reference: String(r.key),
      status: st,
      source: 'idempotency_record',
      userId: null,
      amountCents: null,
      currency: null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
  return null;
}

/**
 * Owner user id for access control (non-admin users may only view their own).
 * @param {{ kind: string, doc: object }|null} hit
 * @returns {string|null}
 */
function ownerUserIdFromHit(hit) {
  if (!hit || !hit.kind || !hit.doc) return null;
  if (hit.kind === 'payment_reference') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'ledger_entry') {
    const a = hit.doc.actorId;
    return a != null ? String(a) : null;
  }
  if (hit.kind === 'order') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'payout_request') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'chargeback') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'payment_transaction') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'dispute') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'ppv_purchase') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'money_index') {
    const u = hit.doc.userId;
    return u != null ? String(u) : null;
  }
  if (hit.kind === 'idempotency_record') {
    return null;
  }
  return null;
}

/**
 * Single-collection money lookup (MoneyIndex).
 * @param {string} trimmed
 * @returns {Promise<object|null>} lean doc or null
 */
async function findMoneyIndexByAnyId(trimmed) {
  const or = [{ refId: trimmed }, { providerId: trimmed }];
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    try {
      or.push({ sourceId: new mongoose.Types.ObjectId(trimmed) });
    } catch {
      /* invalid ObjectId */
    }
  }
  const row = await db.MoneyIndex.findOne({ $or: or }).sort({ updatedAt: -1 }).lean();
  return row || null;
}

/**
 * Legacy multi-table chain (no MoneyIndex). Prefer findUniversalPaymentById.
 * @param {string} trimmed
 * @returns {Promise<{ kind: string, doc: object }|null>}
 */
async function findUniversalPaymentLegacy(trimmed) {
  const pr = await paymentReferenceService.findByReference(trimmed);
  if (pr) return { kind: 'payment_reference', doc: pr };

  const ledgerOr = [
    { refId: trimmed },
    { 'meta.paymentIntentId': trimmed },
    { 'meta.referenceId': trimmed },
  ];
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    ledgerOr.push({ _id: trimmed });
  }
  const le = await db.LedgerEntry.findOne({ $or: ledgerOr }).sort({ createdAt: -1 }).lean();
  if (le) return { kind: 'ledger_entry', doc: le };

  const orderOr = [{ stripeSessionId: trimmed }];
  if (trimmed.startsWith('order:')) {
    const oid = trimmed.slice('order:'.length).trim();
    if (/^[a-fA-F0-9]{24}$/.test(oid)) {
      orderOr.push({ _id: oid });
    }
  }
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    orderOr.push({ _id: trimmed });
  }
  const ord = await db.Order.findOne({ $or: orderOr }).lean();
  if (ord) return { kind: 'order', doc: ord };

  const payoutOr = [];
  if (trimmed.length > 0 && trimmed.length <= 200) {
    payoutOr.push({ externalId: trimmed });
    payoutOr.push({ idempotencyKey: trimmed });
  }
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    payoutOr.push({ _id: trimmed });
  }
  if (payoutOr.length > 0) {
    const prq = await db.PayoutRequest.findOne({ $or: payoutOr }).sort({ createdAt: -1 }).lean();
    if (prq) return { kind: 'payout_request', doc: prq };
  }

  const chargebackOr = [];
  if (trimmed.length > 0 && trimmed.length <= 200) {
    chargebackOr.push({ stripeDisputeId: trimmed });
    chargebackOr.push({ stripeChargeId: trimmed });
    chargebackOr.push({ transactionId: trimmed });
    chargebackOr.push({ refId: trimmed });
  }
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    chargebackOr.push({ _id: trimmed });
  }
  if (chargebackOr.length > 0) {
    const cb = await db.Chargeback.findOne({ $or: chargebackOr }).sort({ createdAt: -1 }).lean();
    if (cb) return { kind: 'chargeback', doc: cb };
  }

  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    const ptx = await db.PaymentTransaction.findOne({ _id: trimmed }).lean();
    if (ptx) return { kind: 'payment_transaction', doc: ptx };
  }

  const disputeOr = [];
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    disputeOr.push({ _id: trimmed });
    disputeOr.push({ transactionId: trimmed });
  }
  if (disputeOr.length > 0) {
    const dp = await db.Dispute.findOne({ $or: disputeOr }).sort({ createdAt: -1 }).lean();
    if (dp) return { kind: 'dispute', doc: dp };
  }

  const ppvOr = [];
  if (trimmed.length > 0 && trimmed.length <= 200) {
    ppvOr.push({ 'meta.paymentIntentId': trimmed });
    ppvOr.push({ 'meta.stripeSessionId': trimmed });
    ppvOr.push({ 'meta.referenceId': trimmed });
  }
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    ppvOr.push({ _id: trimmed });
  }
  if (ppvOr.length > 0) {
    const ppv = await db.PpvPurchase.findOne({ $or: ppvOr }).sort({ createdAt: -1 }).lean();
    if (ppv) return { kind: 'ppv_purchase', doc: ppv };
  }

  if (trimmed.length > 0 && trimmed.length <= 512) {
    const idem = await db.IdempotencyRecord.findOne({ key: trimmed }).lean();
    if (idem) return { kind: 'idempotency_record', doc: idem };
  }

  return null;
}

/**
 * Resolve MoneyIndex first, then legacy multi-table chain (backfills MoneyIndex on legacy hits).
 * @param {string} id
 * @returns {Promise<{ kind: string, doc: object }|null>}
 */
async function findUniversalPaymentById(id) {
  const trimmed = String(id || '').trim();
  if (!trimmed || trimmed.length > 256) return null;

  const mi = await findMoneyIndexByAnyId(trimmed);
  if (mi) return { kind: 'money_index', doc: mi };

  const hit = await findUniversalPaymentLegacy(trimmed);
  if (hit) await backfillMoneyIndexFromHit(hit);
  return hit;
}

module.exports = {
  withLock,
  toUniversalPayment,
  findUniversalPaymentById,
  findMoneyIndexByAnyId,
  ownerUserIdFromHit,
  LockContentionError,
  DEFAULT_LOCK_TTL_MS,
};
