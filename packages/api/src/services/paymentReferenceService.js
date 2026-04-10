'use strict';
/**
 * Payment reference — upsert by referenceId for GET /payments/reference/:ref lookup.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { upsertFromPaymentReferenceRow } = require('@millo/economy');

const PROVIDERS = ['stripe', 'paypal', 'wise', 'coin', 'internal'];
const STATUSES = ['pending', 'completed', 'failed', 'refunded'];

/**
 * Record or update a payment reference (idempotent by referenceId).
 * @param {Object} opts - { provider, referenceId, userId?, status, amount?, amountCents?, currency?, metadata? }
 */
async function upsertPaymentReference(opts = {}) {
  const {
    provider,
    referenceId,
    userId,
    status = 'pending',
    amount,
    amountCents,
    currency = 'USD',
    metadata = {},
  } = opts;
  if (!provider || !referenceId || !PROVIDERS.includes(provider)) return null;
  if (!STATUSES.includes(status)) return null;
  const ref = String(referenceId).trim().slice(0, 256);
  const amountVal = amount != null ? Number(amount) : (amountCents != null ? amountCents / 100 : 0);
  const amountCentsVal = amountCents != null ? Number(amountCents) : (amount != null ? Math.round(Number(amount) * 100) : 0);
  const update = {
    provider,
    referenceId: ref,
    status,
    amount: amountVal,
    amountCents: amountCentsVal,
    currency: (currency || 'USD').toUpperCase().slice(0, 8),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    updatedAt: new Date(),
  };
  if (userId) update.userId = userId;
  const result = await db.PaymentReference.findOneAndUpdate(
    { referenceId: ref },
    { $set: update },
    { upsert: true, new: true }
  );
  // Mongoose can return a document (with toObject()), or a plain object depending on query mode.
  if (!result) return null;
  const plain = typeof result.toObject === 'function' ? result.toObject() : result;
  upsertFromPaymentReferenceRow(plain).catch(() => {});
  return plain;
}

/**
 * Find payment by referenceId or _id. Returns null if not found.
 */
async function findByReference(ref) {
  if (!ref || typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const byRef = await db.PaymentReference.findOne({ referenceId: trimmed }).lean();
  if (byRef) return byRef;
  if (/^[a-fA-F0-9]{24}$/.test(trimmed)) {
    const byId = await db.PaymentReference.findById(trimmed).lean();
    if (byId) return byId;
  }
  return null;
}

module.exports = { upsertPaymentReference, findByReference, PROVIDERS, STATUSES };
