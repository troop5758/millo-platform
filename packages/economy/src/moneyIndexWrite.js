/**
 * MoneyIndex write-through — single collection for universal money lookup.
 * Called from payment flows; no secrets. https://milloapp.com
 */
'use strict';

const crypto = require('crypto');
const db = require('@millo/database');

const TYPES = new Set(['payment', 'payout', 'refund', 'adjustment', 'chargeback']);

/**
 * Upsert by (provider, providerId) unique key.
 * @param {object} opts
 * @param {string} opts.type
 * @param {string} opts.provider
 * @param {string} opts.providerId
 * @param {import('mongoose').Types.ObjectId|string} [opts.userId]
 * @param {number} [opts.amountCents=0]
 * @param {string} [opts.currency='USD']
 * @param {string} [opts.status='pending']
 * @param {string} [opts.sourceKind]
 * @param {import('mongoose').Types.ObjectId|string} [opts.sourceId]
 * @param {string} [opts.refId] - optional fixed UUID (else reuse existing or generate)
 * @param {object} [opts.meta]
 * @returns {Promise<object|null>}
 */
async function upsertMoneyIndexRow(opts = {}) {
  const {
    type,
    provider,
    providerId,
    userId,
    amountCents = 0,
    currency = 'USD',
    status = 'pending',
    sourceKind,
    sourceId,
    refId: explicitRefId,
    meta,
    idempotencyKey,
  } = opts;
  if (!type || !TYPES.has(type)) return null;
  const prov = String(provider || '').trim().slice(0, 64);
  const pid = String(providerId || '').trim().slice(0, 512);
  if (!prov || !pid) return null;

  const existing = await db.MoneyIndex.findOne({ provider: prov, providerId: pid }).lean();
  const refId = explicitRefId || existing?.refId || crypto.randomUUID();

  const idem = idempotencyKey != null && String(idempotencyKey).trim()
    ? String(idempotencyKey).trim().slice(0, 512)
    : undefined;

  const doc = {
    refId,
    type,
    provider: prov,
    providerId: pid,
    userId: userId || undefined,
    amountCents: Math.round(Number(amountCents) || 0),
    currency: String(currency || 'USD').toUpperCase().slice(0, 8),
    status: String(status || 'pending').slice(0, 64),
    sourceKind: sourceKind || undefined,
    sourceId: sourceId || undefined,
    meta: meta && typeof meta === 'object' ? meta : {},
    updatedAt: new Date(),
    ...(idem ? { idempotencyKey: idem } : {}),
  };

  await db.MoneyIndex.findOneAndUpdate(
    { provider: prov, providerId: pid },
    {
      $set: doc,
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );
  return doc;
}

/**
 * Index a PaymentReference-shaped row (Stripe/PayPal/Wise/internal reference id).
 */
async function upsertFromPaymentReferenceRow(pr) {
  if (!pr?.referenceId || !pr?.provider) return null;
  return upsertMoneyIndexRow({
    type: 'payment',
    provider: pr.provider,
    providerId: String(pr.referenceId).trim(),
    userId: pr.userId,
    amountCents: pr.amountCents != null ? Number(pr.amountCents) : Math.round(Number(pr.amount || 0) * 100),
    currency: pr.currency || 'USD',
    status: pr.status || 'pending',
    sourceKind: 'payment_reference',
    sourceId: pr._id,
    meta: pr.metadata && typeof pr.metadata === 'object' ? { ...pr.metadata } : {},
  });
}

/**
 * Index a PaymentTransaction document.
 * @param {object} doc - saved Mongoose doc or plain { _id, userId, creatorId, type, grossAmountCents, currency, paymentProcessor, status }
 * @param {{ provider?: string, providerId?: string }} [override] - link to Stripe id when known
 */
async function upsertFromPaymentTransaction(doc, override = {}) {
  if (!doc?._id) return null;
  const prov = String(override.provider || doc.paymentProcessor || 'internal').slice(0, 64);
  const pid = String(override.providerId || `tx:${String(doc._id)}`).slice(0, 512);
  return upsertMoneyIndexRow({
    type: 'payment',
    provider: prov,
    providerId: pid,
    userId: doc.userId,
    amountCents: doc.grossAmountCents != null ? Number(doc.grossAmountCents) : 0,
    currency: doc.currency || 'USD',
    status: doc.status || 'completed',
    sourceKind: 'payment_transaction',
    sourceId: doc._id,
    meta: { economyType: doc.type, creatorId: doc.creatorId ? String(doc.creatorId) : undefined },
  });
}

/**
 * Index a PayoutRequest document (pending → paid updates same row by source).
 */
/**
 * Index a Chargeback document (Stripe dispute id as providerId).
 */
async function upsertFromChargeback(doc) {
  if (!doc?.stripeDisputeId) return null;
  return upsertMoneyIndexRow({
    type: 'chargeback',
    provider: 'stripe',
    providerId: String(doc.stripeDisputeId).trim(),
    userId: doc.userId,
    amountCents: doc.amountCents != null ? Number(doc.amountCents) : 0,
    currency: String(doc.currency || 'usd').toUpperCase().slice(0, 8),
    status: doc.status || 'open',
    sourceKind: 'chargeback',
    sourceId: doc._id,
    meta: {
      stripeChargeId: doc.stripeChargeId || undefined,
      reason: doc.reason || undefined,
    },
  });
}

/**
 * Index a shop Order (Stripe checkout session id or internal order:ObjectId).
 */
async function upsertFromOrder(order) {
  if (!order?._id) return null;
  const sid = order.stripeSessionId && String(order.stripeSessionId).trim();
  const pid = sid || `order:${String(order._id)}`;
  const prov = sid ? 'stripe' : 'internal';
  const st = String(order.status || 'paid').toLowerCase();
  const miStatus =
    st === 'paid' || st === 'shipped' || st === 'delivered' ? 'completed' : st === 'cancelled' ? 'failed' : 'pending';
  return upsertMoneyIndexRow({
    type: 'payment',
    provider: prov,
    providerId: pid.slice(0, 512),
    userId: order.userId,
    amountCents: order.totalCents != null ? Number(order.totalCents) : 0,
    currency: 'USD',
    status: miStatus,
    sourceKind: 'order',
    sourceId: order._id,
    meta: { orderStatus: order.status },
  });
}

async function upsertFromPayoutRequest(payout) {
  if (!payout?._id) return null;
  const mongoKey = `payout:${String(payout._id)}`;
  const external = payout.externalId && String(payout.externalId).trim();
  const pid = external || mongoKey;
  const prov = String(payout.provider || 'payout').slice(0, 64);
  return upsertMoneyIndexRow({
    type: 'payout',
    provider: prov,
    providerId: pid,
    userId: payout.userId,
    amountCents: payout.amountCents != null ? Number(payout.amountCents) : 0,
    currency: payout.currency || payout.meta?.currency || 'USD',
    status: payout.status || 'pending',
    sourceKind: 'payout_request',
    sourceId: payout._id,
    meta: {
      idempotencyKey: payout.idempotencyKey,
      externalId: external || undefined,
    },
  });
}

/**
 * When payout.externalId is set after processor response, update indexed providerId.
 */
async function patchPayoutExternalId(payout) {
  if (!payout?._id || !payout.externalId) return null;
  const ext = String(payout.externalId).trim();
  const prov = String(payout.provider || 'payout').slice(0, 64);
  const $set = {
    providerId: ext,
    provider: prov,
    status: payout.status || 'paid',
    'meta.externalId': ext,
    updatedAt: new Date(),
  };
  if (payout.amountCents != null) $set.amountCents = Number(payout.amountCents);
  const updated = await db.MoneyIndex.findOneAndUpdate(
    { sourceKind: 'payout_request', sourceId: payout._id },
    { $set },
    { new: true }
  ).lean();
  if (!updated) return upsertFromPayoutRequest(payout);
  return updated;
}

module.exports = {
  upsertMoneyIndexRow,
  upsertFromPaymentReferenceRow,
  upsertFromPaymentTransaction,
  upsertFromChargeback,
  upsertFromOrder,
  upsertFromPayoutRequest,
  patchPayoutExternalId,
};
