/**
 * Phase 9 validation: No duplicate payouts, audit trail complete.
 * Requires MongoDB. https://milloapp.com
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const mongoose = require('mongoose');

const db = require(path.resolve(__dirname, '../../database/src/index.js'));
const billing = require(path.resolve(__dirname, 'index.js'));

let connected = false;
let userId, adminId;

describe('billing', () => {
  beforeEach(async () => {
    if (!connected) {
      await db.connect();
      connected = true;
      userId = new mongoose.Types.ObjectId();
      adminId = new mongoose.Types.ObjectId();
    }
    await db.PayoutRequest.deleteMany({});
    await db.IdempotencyRecord.deleteMany({});
    await db.FinancialAuditLog.deleteMany({});
    await db.AdminAuditLog.deleteMany({});
  });

  it('no duplicate payouts: same idempotency key returns same request', async () => {
    const key = 'payout-key-1';
    const r1 = await billing.requestPayout(userId, 1000, 'stripe', key);
    const r2 = await billing.requestPayout(userId, 1000, 'stripe', key);
    assert.strictEqual(r1._id.toString(), r2._id.toString());
    const count = await db.PayoutRequest.countDocuments({ idempotencyKey: key });
    assert.strictEqual(count, 1);
  });

  it('audit trail complete: approvePayout creates AdminAuditLog and FinancialAuditLog', async () => {
    const r = await billing.requestPayout(userId, 500, 'paypal', 'key-audit');
    await billing.approvePayout(r._id, adminId);
    const adminLog = await db.AdminAuditLog.findOne({ action: 'PAYOUT_APPROVED', targetId: r._id.toString() }).lean();
    assert.ok(adminLog);
    const financialLog = await db.FinancialAuditLog.findOne({ action: 'PAYOUT_PAID' }).lean();
    assert.ok(financialLog);
  });
});

describe('webhook verification', () => {
  it('verifyStripeWebhook returns false when signature or secret missing', () => {
    assert.strictEqual(billing.verifyStripeWebhook('body', '', 'secret'), false);
    assert.strictEqual(billing.verifyStripeWebhook('body', 't=1,v1=ab', ''), false);
  });

  it('verifyStripeWebhook returns false for invalid signature', () => {
    const payload = '{"id":"evt_1"}';
    const sig = 't=1234567890,v1=' + '00'.repeat(32);
    assert.strictEqual(billing.verifyStripeWebhook(payload, sig, 'whsec_test'), false);
  });

  it('verifyStripeWebhook returns true for valid HMAC', () => {
    const crypto = require('crypto');
    const secret = 'whsec_test';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const payload = '{"id":"evt_1"}';
    const signed = `${timestamp}.${payload}`;
    const v1 = crypto.createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
    const sig = `t=${timestamp},v1=${v1}`;
    assert.strictEqual(billing.verifyStripeWebhook(payload, sig, secret), true);
  });

  it('verifyPayPalWebhook returns false for empty payload', () => {
    assert.strictEqual(billing.verifyPayPalWebhook('', { 'paypal-transmission-id': 'x', 'paypal-transmission-sig': 'y', 'paypal-transmission-time': 'z' }), false);
  });

  it('verifyPayPalWebhook returns true when payload and transmission headers present', () => {
    assert.strictEqual(billing.verifyPayPalWebhook('{"event_type":"PAYMENT.CAPTURE.COMPLETED"}', { 'paypal-transmission-id': 'a', 'paypal-transmission-sig': 'b', 'paypal-transmission-time': 'c' }), true);
  });

  it('verifyPayPalWebhookAsync returns ok:false when PAYPAL_WEBHOOK_ID not configured', async () => {
    const orig = process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_WEBHOOK_ID;
    const result = await billing.verifyPayPalWebhookAsync('{"event_type":"test"}', {
      'paypal-transmission-id': 'x',
      'paypal-transmission-sig': 'y',
      'paypal-transmission-time': 'z',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
    });
    if (orig !== undefined) process.env.PAYPAL_WEBHOOK_ID = orig;
    assert.strictEqual(result.ok, false);
    assert.ok(result.error);
  });
});
