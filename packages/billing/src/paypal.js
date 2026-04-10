/**
 * PayPal — payout with idempotency; audit trail. https://milloapp.com
 */
const db = require('@millo/database');
const idempotency = require('./idempotency');

async function createPayout(amountCents, idempotencyKey, meta = {}) {
  return idempotency.executeWithIdempotency(`paypal_payout_${idempotencyKey}`, async () => {
    const externalId = `py_stub_${Date.now()}_${idempotencyKey}`;
    await db.FinancialAuditLog.create({
      action: 'paypal_payout',
      amountCents,
      refType: 'paypal',
      refId: externalId,
      actorId: meta.userId,
      meta: { idempotencyKey, ...meta },
    });
    return { id: externalId, amountCents, status: 'completed' };
  });
}

module.exports = { createPayout };
