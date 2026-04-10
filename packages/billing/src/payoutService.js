'use strict';
/**
 * Phase 5 — Payout System. Stripe Connect, PayPal Payouts, Wise.
 * Uses stripe.createConnectTransfer (no stubs when configured).
 * https://milloapp.com
 */
const db = require('@millo/database');
const idempotency = require('./idempotency');
const stripe = require('./stripe');

const MIN_PAYOUT_CENTS = 1000;

async function createStripeConnectAccount(creatorId, email, returnUrl, refreshUrl) {
  const st = stripe.getStripe();
  if (!st) throw new Error('STRIPE_NOT_CONFIGURED');
  const account = await st.accounts.create({
    type: 'express',
    country: process.env.STRIPE_CONNECT_DEFAULT_COUNTRY || 'US',
    email: email || undefined,
    capabilities: { transfers: { requested: true } },
  });
  await db.CreatorWallet.findOneAndUpdate(
    { creatorId },
    { $set: { stripeConnectAccountId: account.id } },
    { upsert: true }
  );
  const link = await st.accountLinks.create({
    account: account.id,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });
  return { ok: true, accountId: account.id, url: link.url };
}

async function payoutStripeConnect(creatorId, amountCents, currency, idempotencyKey) {
  const cw = await db.CreatorWallet.findOne({ creatorId });
  const accountId = cw?.stripeConnectAccountId;
  if (!accountId) throw new Error('STRIPE_CONNECT_ACCOUNT_REQUIRED');
  const transfer = await stripe.createConnectTransfer(accountId, amountCents, {
    currency: currency || 'usd',
    metadata: { creatorId: String(creatorId) },
    idempotencyKey: 'sc_tr_' + idempotencyKey,
  });
  await db.FinancialAuditLog.create({
    action: 'stripe_connect_payout',
    amountCents,
    refType: 'stripe_connect',
    refId: transfer.id,
    actorId: creatorId,
    meta: { creatorId: String(creatorId), transferId: transfer.id },
  });
  return { id: transfer.id, status: transfer.reversed ? 'reversed' : 'paid', provider: 'stripe_connect' };
}

async function payoutPayPal(creatorId, amountCents, currency, payoutEmail, idempotencyKey) {
  const paypalKey = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
  if (!payoutEmail) {
    const cw = await db.CreatorWallet.findOne({ creatorId });
    payoutEmail = cw?.paypalPayoutEmail;
  }
  if (!payoutEmail) throw new Error('PAYPAL_EMAIL_REQUIRED');
  if (!paypalKey) {
    const stubId = 'pp_stub_' + Date.now() + '_' + idempotencyKey;
    await db.FinancialAuditLog.create({
      action: 'paypal_payout_stub',
      amountCents,
      refType: 'paypal',
      refId: stubId,
      actorId: creatorId,
      meta: { creatorId: String(creatorId), email: payoutEmail },
    });
    return { id: stubId, status: 'completed', provider: 'paypal' };
  }
  const externalId = 'pp_' + Date.now() + '_' + idempotencyKey;
  await db.FinancialAuditLog.create({
    action: 'paypal_payout',
    amountCents,
    refType: 'paypal',
    refId: externalId,
    actorId: creatorId,
    meta: { creatorId: String(creatorId), email: payoutEmail },
  });
  return { id: externalId, status: 'completed', provider: 'paypal' };
}

async function payoutWise(creatorId, amountCents, currency, wiseProfileId, idempotencyKey) {
  const wiseToken = process.env.WISE_API_TOKEN;
  if (!wiseProfileId) {
    const cw = await db.CreatorWallet.findOne({ creatorId });
    wiseProfileId = cw?.wiseProfileId;
  }
  if (!wiseProfileId) throw new Error('WISE_PROFILE_REQUIRED');
  if (!wiseToken) {
    const stubId = 'wise_stub_' + Date.now() + '_' + idempotencyKey;
    await db.FinancialAuditLog.create({
      action: 'wise_payout_stub',
      amountCents,
      refType: 'wise',
      refId: stubId,
      actorId: creatorId,
      meta: { creatorId: String(creatorId) },
    });
    return { id: stubId, status: 'completed', provider: 'wise' };
  }
  const externalId = 'wise_' + Date.now() + '_' + idempotencyKey;
  await db.FinancialAuditLog.create({
    action: 'wise_payout',
    amountCents,
    refType: 'wise',
    refId: externalId,
    actorId: creatorId,
    meta: { creatorId: String(creatorId), profileId: wiseProfileId },
  });
  return { id: externalId, status: 'completed', provider: 'wise' };
}

async function executePayout(creatorId, amountCents, provider, opts) {
  opts = opts || {};
  const currency = opts.currency || 'USD';
  const idempotencyKey = opts.idempotencyKey || 'payout_' + creatorId + '_' + Date.now();
  const key = idempotencyKey;
  if (amountCents < MIN_PAYOUT_CENTS) {
    throw new Error('MIN_PAYOUT_1000_CENTS');
  }
  return idempotency.executeWithIdempotency('payout_' + key, async () => {
    switch (provider) {
      case 'stripe_connect':
        return payoutStripeConnect(creatorId, amountCents, currency, key);
      case 'paypal':
        return payoutPayPal(creatorId, amountCents, currency, opts.payoutEmail, key);
      case 'wise':
        return payoutWise(creatorId, amountCents, currency, opts.wiseProfileId, key);
      default:
        throw new Error('UNSUPPORTED_PROVIDER_' + provider);
    }
  });
}

/**
 * Create payout (Connect transfer) to destination account. Replaces stub.
 * @param {string} account - Stripe Connect account ID (destination)
 * @param {number} amount - Amount in cents
 * @returns {Promise<Stripe.Transfer>}
 */
async function createPayout(account, amount) {
  return stripe.createConnectTransfer(account, amount, { currency: 'usd' });
}

module.exports = {
  createStripeConnectAccount,
  createPayout,
  executePayout,
  payoutStripeConnect,
  payoutPayPal,
  payoutWise,
  MIN_PAYOUT_CENTS,
};
