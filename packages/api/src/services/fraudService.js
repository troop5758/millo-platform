'use strict';
/**
 * Phase 11 — Fraud Prevention. Signals: IP mismatch, device fingerprint, payment anomalies, multiple accounts.
 * Tools: Stripe Radar (built-in), Sift, Riskified (optional). IP reputation: MaxMind, IP2Proxy, Cloudflare.
 * https://milloapp.com
 */
const db = require('@millo/database');
const ipReputation = require('./ipReputationService');
const { applyRiskEnforcement } = require('./riskEnforcementEngine');

/** @returns {number} Block when `riskScore` **>** this value (Phase 3 policy: `FRAUD_TIER_BLOCK`, default 70). */
function paymentEvaluateBlockThreshold() {
  const n = Number(process.env.FRAUD_TIER_BLOCK);
  return Number.isFinite(n) && n >= 0 ? n : 70;
}

/** @returns {number} Review when `riskScore` **>** this value and ≤ block threshold. */
function paymentEvaluateReviewThreshold() {
  const tier = Number(process.env.FRAUD_TIER_REVIEW);
  if (Number.isFinite(tier) && tier >= 0) return tier;
  const pay = Number(process.env.PAYMENT_RISK_REVIEW_THRESHOLD);
  if (Number.isFinite(pay) && pay >= 0) return pay;
  return 50;
}
const HIGH_AMOUNT_CENTS = 50000; // $500
const MULTI_ACCOUNT_THRESHOLD = 3;
const PAYMENT_VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PAYMENT_VELOCITY_LIMIT = 5;
const PPV_VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const PPV_VELOCITY_LIMIT = 15; // max PPV unlocks per hour
const GIFT_VELOCITY_WINDOW_MS = 60 * 1000; // 1 minute
const GIFT_VELOCITY_LIMIT = 20; // max gifts per minute (fallback; prefer platform max_gifts_per_minute = 10)
const GIFT_VALUE_PER_HOUR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GIFT_VALUE_PER_HOUR_CENTS = 10000; // $100 max gift value per hour per sender (anti-fraud)
const MULTI_ACCOUNT_GIFT_THRESHOLD = 5; // same device, many accounts = device farm
const CIRCULAR_GIFT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const CIRCULAR_GIFT_THRESHOLD = 5; // receiver→sender gifts in 24h = fraud ring
const GIFT_RING_WINDOW_DAYS = Number(process.env.GIFT_RING_WINDOW_DAYS) || 7;
const GIFT_RING_TRANSACTION_THRESHOLD = Number(process.env.GIFT_RING_TRANSACTION_THRESHOLD) || 10; // cluster gift transactions above this → flag
const GIFT_RISK_THRESHOLD_STRICT = 50; // above this → max 5 gifts/min
const GIFT_VELOCITY_LIMIT_HIGH_RISK = 5; // strict limit for high-risk users
const VIEWER_SPIKE_WINDOW_MS = 10 * 1000; // 10 seconds
const VIEWER_SPIKE_THRESHOLD = 200; // joins in window = bot spike

/**
 * Detect multi-account / device farm — same fingerprint used by many users.
 * Returns { allowed, accountCount }. Blocks when accountCount >= threshold.
 */
async function checkMultiAccount(fingerprint, threshold = MULTI_ACCOUNT_GIFT_THRESHOLD) {
  if (!fingerprint || String(fingerprint).trim().length < 8) return { allowed: true, accountCount: 0 };
  const fp = String(fingerprint).trim().slice(0, 256);
  const distinctUsers = await db.DeviceFingerprint.distinct('userId', { fingerprint: fp });
  const accountCount = distinctUsers.length;
  return { allowed: accountCount < threshold, accountCount };
}

/**
 * Record device fingerprint. Called by frontend after auth.
 * Supports TikTok-style payload: visitorId, userAgent, screen, timezone (and meta for extra signals).
 * Part 8: if no stable `fingerprint`/`visitorId` (length ≥ 8), derives SHA-256 from userAgent+ip+screen+timezone.
 */
async function recordDevice(userId, fingerprint, opts = {}) {
  if (!userId) return null;
  const { ip, userAgent, timezone, screen, screenResolution, visitorId, meta } = opts;

  let fp = fingerprint != null ? String(fingerprint).trim() : '';
  if (!fp || fp.length < 8) {
    const { hashDeviceFingerprint } = require('../lib/deviceFingerprintHash');
    const ua = userAgent != null ? String(userAgent) : '';
    const ipStr = ip != null ? String(ip) : '';
    const scr =
      screen != null ? String(screen) : (screenResolution != null ? String(screenResolution) : '');
    const tz = timezone != null ? String(timezone) : '';
    fp = hashDeviceFingerprint({ userAgent: ua, ip: ipStr, screen: scr, timezone: tz });
  }
  fp = fp.slice(0, 256);
  if (fp.length < 8) return null;
  const update = {
    lastSeenAt: new Date(),
    ...(ip != null && { ip }),
    ...(userAgent != null && { userAgent }),
    ...(timezone != null && { timezone }),
    ...(screen != null && { screenResolution: String(screen).slice(0, 64) }),
    ...(screenResolution != null && { screenResolution: String(screenResolution).slice(0, 64) }),
    ...(visitorId != null && { visitorId: String(visitorId).slice(0, 128) }),
    ...(meta != null && typeof meta === 'object' && { meta }),
  };
  const existing = await db.DeviceFingerprint.findOne({ fingerprint: fp, userId });
  if (existing) {
    await db.DeviceFingerprint.updateOne({ _id: existing._id }, { $set: update });
    try {
      const deviceReputation = require('./deviceReputationService');
      await deviceReputation.updateReputation(fp);
    } catch (_) {}
    return existing;
  }
  const created = await db.DeviceFingerprint.create({
    fingerprint: fp,
    userId,
    ip: ip || undefined,
    userAgent: userAgent || undefined,
    timezone: timezone || undefined,
    screenResolution: (screen || screenResolution) ? String(screen || screenResolution).slice(0, 64) : undefined,
    visitorId: visitorId ? String(visitorId).slice(0, 128) : undefined,
    meta: meta && typeof meta === 'object' ? meta : {},
  });
  try {
    const deviceReputation = require('./deviceReputationService');
    await deviceReputation.updateReputation(fp);
  } catch (_) {}
  return created;
}

/**
 * Evaluate payment for fraud. Returns { riskScore, action, signals }.
 * action: 'allow' | 'review' | 'block'
 */
async function evaluatePayment(userId, amountCents, opts = {}) {
  const { ip, userAgent, deviceFingerprint } = opts;
  const signals = [];
  let riskScore = 0;

  const uid = userId?.toString?.() || userId;

  // 0. IP reputation — MaxMind, IP2Proxy. Block when > 80.
  if (ip) {
    const ipRisk = await ipReputation.getIpRiskScore(ip);
    if (ipRisk.riskScore > ipReputation.IP_RISK_THRESHOLD_BLOCK) {
      await applyRiskEnforcement(uid, 100, {
        source: 'payment_fraud_ip_block',
        meta: { signals: ipRisk.signals },
      }).catch(() => {});
      return {
        riskScore: 100,
        action: 'block',
        signals: ['ip_reputation_block', ...(ipRisk.signals || [])],
      };
    }
    if (ipRisk.riskScore > 0) {
      riskScore += ipRisk.riskScore;
      if (ipRisk.signals?.length) signals.push(...ipRisk.signals);
    }
  }

  // 1. Multiple accounts + device reputation (Device DNA)
  if (deviceFingerprint) {
    const fp = String(deviceFingerprint).trim().slice(0, 256);
    const distinctUsers = await db.DeviceFingerprint.distinct('userId', { fingerprint: fp });
    if (distinctUsers.length >= MULTI_ACCOUNT_THRESHOLD) {
      signals.push('multiple_accounts');
      riskScore += 35;
    }
    try {
      const deviceReputation = require('./deviceReputationService');
      const devRep = await deviceReputation.getReputationScore(fp);
      if (devRep <= 20) {
        signals.push('device_reputation_very_low');
        riskScore += 25;
      }
    } catch (_) {}
    // New device for this user
    const userDevice = await db.DeviceFingerprint.findOne({
      fingerprint: fp,
      userId: uid,
    });
    if (!userDevice) {
      signals.push('device_new');
      riskScore += 15;
    }
  }

  // 2. IP mismatch — user's devices have different IPs; current IP never seen
  if (ip) {
    const userDevices = await db.DeviceFingerprint.find({ userId: uid }).lean();
    const seenIps = new Set(userDevices.map((d) => d.ip).filter(Boolean));
    if (seenIps.size > 0 && !seenIps.has(ip)) {
      signals.push('ip_mismatch');
      riskScore += 20;
    }
  }

  // 2b. Device count — user has many devices (potential account sharing / fraud)
  const deviceCount = await db.DeviceFingerprint.countDocuments({ userId: uid });
  if (deviceCount > 3) {
    signals.push('device_count_high');
    riskScore += 20;
  }

  // 2c. Geo-mismatch — Account vs IP vs Card. Triple mismatch (all different) = high risk.
  const { ipCountry, accountCountry, cardCountry } = opts;
  const ipC = ipCountry ? String(ipCountry).toUpperCase().slice(0, 2) : null;
  const accC = accountCountry ? String(accountCountry).toUpperCase().slice(0, 2) : null;
  const cardC = cardCountry ? String(cardCountry).toUpperCase().slice(0, 2) : null;

  if (ipC && accC && ipC !== accC) {
    signals.push('ip_country_mismatch');
    riskScore += 30;
  }
  if (cardC && accC && cardC !== accC) {
    signals.push('card_country_mismatch');
    riskScore += 40;
  }
  // Triple mismatch: Account USA, Card Brazil, IP Russia — high risk
  if (ipC && accC && cardC && ipC !== accC && ipC !== cardC && accC !== cardC) {
    signals.push('geo_mismatch_triple');
    riskScore += 60;
  }

  // 3. Payment anomalies — high amount, velocity
  const recentPayments = await db.FraudEvent.countDocuments({
    userId: uid,
    eventType: 'payment',
    createdAt: { $gte: new Date(Date.now() - PAYMENT_VELOCITY_WINDOW_MS) },
  });
  if (recentPayments >= PAYMENT_VELOCITY_LIMIT) {
    signals.push('payment_velocity');
    riskScore += 25;
  }
  if (amountCents >= HIGH_AMOUNT_CENTS) {
    const userCreated = await db.User.findById(uid).select('createdAt').lean();
    const accountAgeDays = userCreated
      ? (Date.now() - new Date(userCreated.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      : 999;
    if (accountAgeDays < 7) {
      signals.push('payment_anomaly_high_amount_new_account');
      riskScore += 30;
    } else {
      signals.push('payment_anomaly_high_amount');
      riskScore += 10;
    }
  }

  const blockAt = paymentEvaluateBlockThreshold();
  const reviewAt = paymentEvaluateReviewThreshold();
  let action = 'allow';
  if (riskScore > blockAt) action = 'block';
  else if (riskScore > reviewAt) action = 'review';

  return { riskScore, action, signals };
}

/**
 * Check PPV velocity — max unlocks per hour. Returns { allowed, count }.
 */
async function checkPpvVelocity(userId) {
  const uid = userId?.toString?.() || userId;
  const since = new Date(Date.now() - PPV_VELOCITY_WINDOW_MS);
  const count = await db.FraudEvent.countDocuments({
    userId: uid,
    eventType: 'ppv_unlock',
    createdAt: { $gte: since },
  });
  return { allowed: count < PPV_VELOCITY_LIMIT, count };
}

/**
 * Evaluate gift risk score (lightweight). Used for risk-based gift limits.
 * Returns { riskScore }. High score → stricter velocity limit.
 */
async function evaluateGiftRisk(userId, opts = {}) {
  const uid = userId?.toString?.() || userId;
  let riskScore = 0;

  if (opts.ip) {
    const ipRisk = await ipReputation.getIpRiskScore(opts.ip);
    if (ipRisk.riskScore > ipReputation.IP_RISK_THRESHOLD_BLOCK) {
      await applyRiskEnforcement(uid, 100, { source: 'gift_risk_ip_block' }).catch(() => {});
      return { riskScore: 100 };
    }
    riskScore += ipRisk.riskScore;
  }

  const deviceCount = await db.DeviceFingerprint.countDocuments({ userId: uid });
  if (deviceCount > 3) riskScore += 20;
  if (opts.fingerprint) {
    const distinctUsers = await db.DeviceFingerprint.distinct('userId', {
      fingerprint: String(opts.fingerprint).trim().slice(0, 256),
    });
    if (distinctUsers.length >= MULTI_ACCOUNT_GIFT_THRESHOLD) riskScore += 35;
  }
  const recentReview = await db.FraudEvent.countDocuments({
    userId: uid,
    action: { $in: ['review', 'block'] },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });
  if (recentReview > 0) riskScore += 25;

  // Payment reversal pattern: user with chargebacks is higher risk for gift fraud
  const chargebackCount = await db.Chargeback.countDocuments({
    userId: uid,
    createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  });
  if (chargebackCount > 0) riskScore += 40;

  await applyRiskEnforcement(uid, riskScore, { source: 'gift_risk' }).catch(() => {});

  return { riskScore };
}

/**
 * Whether user has any chargeback in the last N days (payment reversal pattern — block or restrict gifts).
 */
async function hasRecentChargebacks(userId, windowDays = 90) {
  if (!userId) return false;
  const uid = userId?.toString?.() || userId;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const n = await db.Chargeback.countDocuments({ userId: uid, createdAt: { $gte: since } });
  return n > 0;
}

/**
 * Get configurable gift velocity limits (platform settings or defaults).
 * Recommended: maxGiftsPerMinute = 10, maxGiftValuePerHourCents = 10000 ($100).
 */
async function getGiftVelocityLimits() {
  try {
    const [perMin, perHour] = await Promise.all([
      db.PlatformSetting.findOne({ key: 'max_gifts_per_minute' }).lean(),
      db.PlatformSetting.findOne({ key: 'max_gift_value_per_hour_cents' }).lean(),
    ]);
    return {
      maxGiftsPerMinute: perMin?.value != null ? Math.max(1, Number(perMin.value)) : 10,
      maxGiftValuePerHourCents: perHour?.value != null ? Math.max(100, Number(perHour.value)) : GIFT_VALUE_PER_HOUR_CENTS,
    };
  } catch {
    return { maxGiftsPerMinute: 10, maxGiftValuePerHourCents: GIFT_VALUE_PER_HOUR_CENTS };
  }
}

/**
 * Check gift velocity — max gifts per minute. Returns { allowed, count }.
 * Uses platform max_gifts_per_minute (default 10). If riskScore > 50, uses stricter limit (5/min).
 */
async function checkGiftVelocity(userId, opts = {}) {
  const uid = userId?.toString?.() || userId;
  const limits = await getGiftVelocityLimits();
  const limit = opts.riskScore != null && opts.riskScore > GIFT_RISK_THRESHOLD_STRICT
    ? GIFT_VELOCITY_LIMIT_HIGH_RISK
    : limits.maxGiftsPerMinute;
  const since = new Date(Date.now() - GIFT_VELOCITY_WINDOW_MS);
  const count = await db.LedgerEntry.countDocuments({
    actorId: uid,
    refType: 'gift',
    type: 'debit',
    createdAt: { $gte: since },
  });
  return { allowed: count < limit, count };
}

/**
 * Check gift value per hour — max total gift value (cents) sent in the last hour.
 * Stops high-velocity spend (e.g. max $100/hour). Returns { allowed, totalCents, limitCents }.
 */
async function checkGiftValuePerHour(userId, additionalCents) {
  const uid = userId?.toString?.() || userId;
  const limits = await getGiftVelocityLimits();
  const capCents = limits.maxGiftValuePerHourCents;
  const since = new Date(Date.now() - GIFT_VALUE_PER_HOUR_WINDOW_MS);
  const mongoose = require('mongoose');
  const oid = mongoose.Types.ObjectId.isValid(uid) ? new mongoose.Types.ObjectId(uid) : uid;
  const agg = await db.LedgerEntry.aggregate([
    {
      $match: {
        actorId: oid,
        refType: 'gift',
        type: 'debit',
        createdAt: { $gte: since },
      },
    },
    { $group: { _id: null, total: { $sum: '$amountCents' } } },
  ]);
  const totalCents = (agg[0]?.total ?? 0) + Math.max(0, Number(additionalCents) || 0);
  return {
    allowed: totalCents <= capCents,
    totalCents,
    limitCents: capCents,
  };
}

/**
 * Block self-gift: same account cannot send gifts to itself.
 */
function blockSelfGift(senderId, receiverId) {
  const sender = senderId?.toString?.() || senderId;
  const receiver = receiverId?.toString?.() || receiverId;
  return !sender || !receiver || sender !== receiver;
}

/**
 * Detect circular gift trading — receiver has sent many gifts back to sender in 24h.
 * Fraud rings send gifts back and forth. Also blocks self-gift (sender === receiver). Returns { allowed, count }.
 */
async function checkCircularGifts(senderId, receiverId, threshold = CIRCULAR_GIFT_THRESHOLD) {
  const sender = senderId?.toString?.() || senderId;
  const receiver = receiverId?.toString?.() || receiverId;
  if (!sender || !receiver) return { allowed: true, count: 0 };
  if (sender === receiver) return { allowed: false, count: 0 };
  const since = new Date(Date.now() - CIRCULAR_GIFT_WINDOW_MS);
  const count = await db.LedgerEntry.countDocuments({
    actorId: receiver,
    'meta.receiverId': sender,
    refType: 'gift',
    type: 'debit',
    createdAt: { $gte: since },
  });
  return { allowed: count < threshold, count };
}

/**
 * Gift fraud: same device — sender's device fingerprint is linked to receiver (self-gift or same-machine exploit).
 * Rule: if gift.senderDevice === gift.receiverDevice → flag. Receiver "has" the device if DeviceFingerprint has (fingerprint, userId: receiverId).
 */
async function checkSameDeviceGift(senderId, receiverId, senderFingerprint) {
  if (!senderFingerprint || String(senderFingerprint).trim().length < 8) return { allowed: true, reason: null };
  const receiver = receiverId?.toString?.() || receiverId;
  if (!receiver) return { allowed: true, reason: null };
  const fp = String(senderFingerprint).trim().slice(0, 256);
  const receiverHasDevice = await db.DeviceFingerprint.exists({ fingerprint: fp, userId: receiver });
  return { allowed: !receiverHasDevice, reason: receiverHasDevice ? 'same_device' : null };
}

/**
 * Gift fraud: same IP — sender IP matches receiver's recent login IP (same location/machine).
 */
async function checkSameIpGift(senderId, receiverId, senderIp) {
  if (!senderIp || !receiverId) return { allowed: true, reason: null };
  const receiver = receiverId?.toString?.() || receiverId;
  const last = await db.LoginAudit.findOne({ userId: receiver, loginSuccess: true })
    .sort({ createdAt: -1 })
    .select('ip')
    .lean();
  const receiverIp = last?.ip;
  if (!receiverIp || senderIp !== receiverIp) return { allowed: true, reason: null };
  return { allowed: false, reason: 'same_ip' };
}

/**
 * Flag gift fraud: create FraudEvent for sender (eventType gift, action block, signals).
 */
async function flagGiftFraud(senderId, reason, meta = {}) {
  if (!senderId) return;
  await db.FraudEvent.create({
    userId: senderId,
    eventType: 'gift',
    action: 'block',
    signals: Array.isArray(reason) ? reason : [reason],
    refType: 'gift',
    refId: meta.giftId || meta.refId || 'gift_fraud',
    meta: { ...meta },
  }).catch(() => {});
}

/** Subscription fraud: same-device threshold (subscriber device === creator device = self-sub). */
const SUBSCRIPTION_FARM_WINDOW_DAYS = Number(process.env.SUBSCRIPTION_FARM_WINDOW_DAYS) || 7;
const SUBSCRIPTION_FARM_MAX_SUBS_PER_DEVICE = Number(process.env.SUBSCRIPTION_FARM_MAX_SUBS_PER_DEVICE) || 10;
const SUBSCRIPTION_REFUND_LOOP_WINDOW_DAYS = Number(process.env.SUBSCRIPTION_REFUND_LOOP_WINDOW_DAYS) || 30;
const SUBSCRIPTION_REFUND_LOOP_MIN_SUBS = Number(process.env.SUBSCRIPTION_REFUND_LOOP_MIN_SUBS) || 2;
const SUBSCRIPTION_REFUND_LOOP_MIN_REFUNDS = Number(process.env.SUBSCRIPTION_REFUND_LOOP_MIN_REFUNDS) || 2;

/**
 * Subscription fraud: same device — subscriber's device is linked to creator (self-subscription via same device).
 * Rule: if (subscriptionDevice === creatorDevice) flagSubscriptionFraud().
 */
async function checkSameDeviceSubscription(subscriberId, creatorId, subscriberFingerprint) {
  if (!subscriberFingerprint || String(subscriberFingerprint).trim().length < 8) return { allowed: true, reason: null };
  const creator = creatorId?.toString?.() || creatorId;
  if (!creator) return { allowed: true, reason: null };
  const fp = String(subscriberFingerprint).trim().slice(0, 256);
  const creatorHasDevice = await db.DeviceFingerprint.exists({ fingerprint: fp, userId: creator });
  return { allowed: !creatorHasDevice, reason: creatorHasDevice ? 'same_device' : null };
}

/**
 * Subscription farm: same device used by many accounts to subscribe (bot accounts subscribing).
 */
async function checkSubscriptionFarm(subscriberFingerprint, windowDays = SUBSCRIPTION_FARM_WINDOW_DAYS) {
  if (!subscriberFingerprint || String(subscriberFingerprint).trim().length < 8) return { allowed: true, count: 0 };
  const fp = String(subscriberFingerprint).trim().slice(0, 256);
  const userIds = await db.DeviceFingerprint.distinct('userId', { fingerprint: fp });
  if (userIds.length === 0) return { allowed: true, count: 0 };
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const count = await db.Subscription.countDocuments({
    userId: { $in: userIds },
    status: 'active',
    createdAt: { $gte: since },
  });
  const allowed = count <= SUBSCRIPTION_FARM_MAX_SUBS_PER_DEVICE;
  return { allowed, count };
}

/**
 * Refund loop: repeated subscribe → refund for same subscriber+creator.
 */
async function checkSubscriptionRefundLoop(subscriberId, creatorId, windowDays = SUBSCRIPTION_REFUND_LOOP_WINDOW_DAYS) {
  const subId = subscriberId?.toString?.() || subscriberId;
  const cId = creatorId?.toString?.() || creatorId;
  if (!subId || !cId) return { allowed: true, subCount: 0, refundCount: 0 };
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const [subCount, refundCount] = await Promise.all([
    db.Subscription.countDocuments({ userId: subId, creatorId: cId, createdAt: { $gte: since } }),
    db.LedgerEntry.countDocuments({
      actorId: subId,
      type: { $in: ['refund', 'subscription_refund'] },
      refType: 'subscription',
      'meta.creatorId': cId,
      createdAt: { $gte: since },
    }),
  ]);
  const loop = subCount >= SUBSCRIPTION_REFUND_LOOP_MIN_SUBS && refundCount >= SUBSCRIPTION_REFUND_LOOP_MIN_REFUNDS;
  return { allowed: !loop, subCount, refundCount };
}

/**
 * Flag subscription fraud: create FraudEvent (eventType subscription_fraud, action block).
 */
async function flagSubscriptionFraud(userId, reason, meta = {}) {
  if (!userId) return;
  await db.FraudEvent.create({
    userId,
    eventType: 'subscription_fraud',
    action: 'block',
    signals: Array.isArray(reason) ? reason : [reason],
    refType: 'subscription',
    refId: meta.creatorId || meta.refId || 'subscription_fraud',
    meta: { ...meta },
  }).catch(() => {});
  try {
    const monetizationRiskAlertService = require('./monetizationRiskAlertService');
    await monetizationRiskAlertService.alertFraudTeam('abnormal_subscriptions', {
      userId: userId?.toString?.() || userId,
      reason: Array.isArray(reason) ? reason[0] : reason,
      ...meta,
    }, { debounceMs: 60 * 60 * 1000 });
  } catch (_) {}
}

const SUBSCRIPTION_FRAUD_FLAG_LOOKBACK_DAYS = 90;

/**
 * Whether the user has been flagged for subscription fraud (block future subscriptions).
 */
async function hasSubscriptionFraudFlag(userId, lookbackDays = SUBSCRIPTION_FRAUD_FLAG_LOOKBACK_DAYS) {
  if (!userId) return false;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const found = await db.FraudEvent.exists({
    userId,
    eventType: 'subscription_fraud',
    action: 'block',
    createdAt: { $gte: since },
  });
  return !!found;
}

// --- Auction abuse detection (fake bidders, seller alts, device match, bid cluster, last-second pattern) ---

const AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER = Number(process.env.AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER) || 8;
const AUCTION_LAST_SECOND_WINDOW_SEC = Number(process.env.AUCTION_LAST_SECOND_WINDOW_SEC) || 30;
const AUCTION_LAST_SECOND_MAX_BIDS = Number(process.env.AUCTION_LAST_SECOND_MAX_BIDS) || 2;

/**
 * Rule: if (bidderDevice === sellerDevice) blockBid(). Seller "has" the device if DeviceFingerprint has (fingerprint, userId: sellerId).
 */
async function checkSameDeviceAuctionBid(bidderId, sellerId, bidderFingerprint) {
  if (!bidderFingerprint || String(bidderFingerprint).trim().length < 8) return { allowed: true, reason: null };
  const seller = sellerId?.toString?.() || sellerId;
  if (!seller) return { allowed: true, reason: null };
  const fp = String(bidderFingerprint).trim().slice(0, 256);
  const sellerHasDevice = await db.DeviceFingerprint.exists({ fingerprint: fp, userId: seller });
  return { allowed: !sellerHasDevice, reason: sellerHasDevice ? 'same_device' : null };
}

/**
 * Bid cluster: same accounts always bidding (e.g. one bidder dominates bids on this auction = possible shill).
 */
async function checkAuctionBidCluster(auctionId, bidderId) {
  if (!auctionId || !bidderId) return { allowed: true, reason: null };
  const auction = await db.Auction.findById(auctionId).select('bids').lean();
  if (!auction?.bids?.length) return { allowed: true, reason: null };
  const bidderStr = bidderId.toString?.() || String(bidderId);
  const thisBidderCount = auction.bids.filter((b) => (b.bidderId?.toString?.() || b.bidderId) === bidderStr).length;
  const allowed = thisBidderCount < AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER;
  return { allowed, reason: allowed ? null : 'bid_cluster', bidCount: thisBidderCount };
}

/**
 * Last-second fake bids: repeated bids in final seconds of auction from same bidder.
 * Window = [endsAt - windowSec, endsAt]; only runs when auction ends within windowSec.
 */
async function checkLastSecondBidPattern(auctionId, bidderId, endsAt) {
  if (!auctionId || !bidderId || !endsAt) return { allowed: true, reason: null };
  const now = new Date();
  const end = new Date(endsAt);
  const windowMs = AUCTION_LAST_SECOND_WINDOW_SEC * 1000;
  if (end.getTime() - now.getTime() > windowMs) return { allowed: true, reason: null };
  const auction = await db.Auction.findById(auctionId).select('bids').lean();
  if (!auction?.bids?.length) return { allowed: true, reason: null };
  const bidderStr = bidderId.toString?.() || String(bidderId);
  const windowStart = new Date(end.getTime() - windowMs);
  const recentBids = auction.bids.filter(
    (b) => (b.bidderId?.toString?.() || b.bidderId) === bidderStr && new Date(b.createdAt) >= windowStart
  );
  const allowed = recentBids.length < AUCTION_LAST_SECOND_MAX_BIDS;
  return { allowed, reason: allowed ? null : 'last_second_pattern', count: recentBids.length };
}

/**
 * Flag auction bid fraud for audit/review.
 */
async function flagAuctionBidFraud(bidderId, auctionId, reason, meta = {}) {
  if (!bidderId) return;
  await db.FraudEvent.create({
    userId: bidderId,
    eventType: 'auction_fraud',
    action: 'block',
    signals: Array.isArray(reason) ? reason : [reason],
    refType: 'auction',
    refId: auctionId?.toString?.() || String(auctionId),
    meta: { reason: Array.isArray(reason) ? reason[0] : reason, ...meta },
  }).catch(() => {});
}

/**
 * Whether the user has a recent auction_fraud flag (block further bids in auctions).
 */
async function hasAuctionBidFraudFlag(userId, lookbackDays = 30) {
  if (!userId) return false;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const found = await db.FraudEvent.exists({
    userId,
    eventType: 'auction_fraud',
    action: 'block',
    createdAt: { $gte: since },
  });
  return !!found;
}

/**
 * Build directed gift graph from LedgerEntry (refType gift, type debit). Returns edge counts: Map fromId -> Map toId -> count.
 */
async function getGiftGraphEdges(windowDays = GIFT_RING_WINDOW_DAYS) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const entries = await db.LedgerEntry.find({
    refType: 'gift',
    type: 'debit',
    createdAt: { $gte: since },
  })
    .select('actorId meta')
    .lean();
  const edgeCount = new Map();
  for (const e of entries) {
    const fromId = e.actorId?.toString?.() || (e.actorId && String(e.actorId));
    const toId = e.meta?.receiverId?.toString?.() || (e.meta?.receiverId && String(e.meta.receiverId));
    if (!fromId || !toId || fromId === toId) continue;
    if (!edgeCount.has(fromId)) edgeCount.set(fromId, new Map());
    const toMap = edgeCount.get(fromId);
    toMap.set(toId, (toMap.get(toId) || 0) + 1);
  }
  return edgeCount;
}

/**
 * Find 3-cycles (A→B→C→A) in gift graph and return clusters with transaction count above threshold.
 * Pattern: Account A gifts B, B gifts C, C gifts A (repeated).
 */
function findGiftRingClusters(edgeCount, transactionThreshold = GIFT_RING_TRANSACTION_THRESHOLD) {
  const clusters = [];
  const seen = new Set();
  const nodes = new Set();
  for (const [from, toMap] of edgeCount) {
    nodes.add(from);
    for (const to of toMap.keys()) nodes.add(to);
  }
  const nodeList = [...nodes];
  for (let i = 0; i < nodeList.length; i++) {
    const A = nodeList[i];
    const toA = edgeCount.get(A);
    if (!toA) continue;
    for (const B of toA.keys()) {
      const toB = edgeCount.get(B);
      if (!toB) continue;
      for (const C of toB.keys()) {
        if (C === A || C === B) continue;
        const toC = edgeCount.get(C);
        if (!toC || !toC.has(A)) continue;
        const key = [A, B, C].sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const countAB = toA.get(B) || 0;
        const countBC = toB.get(C) || 0;
        const countCA = toC.get(A) || 0;
        const total = countAB + countBC + countCA;
        if (total >= transactionThreshold) {
          clusters.push({ memberIds: [A, B, C], transactionCount: total });
        }
      }
    }
  }
  return clusters;
}

/**
 * Detect gift rings: graph pattern A→B, B→C, C→A repeated. Returns clusters where clusterGiftTransactions > threshold.
 */
async function detectGiftRings(windowDays = GIFT_RING_WINDOW_DAYS, transactionThreshold = GIFT_RING_TRANSACTION_THRESHOLD) {
  const edgeCount = await getGiftGraphEdges(windowDays);
  const clusters = findGiftRingClusters(edgeCount, transactionThreshold);
  return { clusters, windowDays, transactionThreshold };
}

/**
 * Flag a gift ring cluster: create FraudEvent (gift, block, gift_ring) for each member.
 */
async function flagGiftRing(cluster) {
  const memberIds = cluster.memberIds || [];
  const transactionCount = cluster.transactionCount ?? 0;
  for (const userId of memberIds) {
    if (!userId) continue;
    await db.FraudEvent.create({
      userId,
      eventType: 'gift',
      action: 'block',
      signals: ['gift_ring'],
      refType: 'gift',
      refId: 'gift_ring',
      meta: { clusterMemberIds: memberIds, transactionCount },
    }).catch(() => {});
  }
}

/**
 * Run gift ring detection and flag clusters above threshold.
 */
async function runGiftRingDetectionAndFlag(windowDays = GIFT_RING_WINDOW_DAYS, transactionThreshold = GIFT_RING_TRANSACTION_THRESHOLD) {
  const { clusters } = await detectGiftRings(windowDays, transactionThreshold);
  for (const cluster of clusters) {
    await flagGiftRing(cluster);
  }
  if (clusters.length > 0) {
    try {
      const monetizationRiskAlertService = require('./monetizationRiskAlertService');
      await monetizationRiskAlertService.alertFraudTeam('suspicious_gift_loops', {
        clusterCount: clusters.length,
        memberIds: clusters.flatMap((c) => c.memberIds || []),
        windowDays,
        transactionThreshold,
      }, { debounceMs: 60 * 60 * 1000 });
    } catch (_) {}
  }
  return { flaggedCount: clusters.length, clusters };
}

const GIFT_RING_FLAG_LOOKBACK_DAYS = 30;

/**
 * Whether the user has been flagged for gift ring (block future gifts).
 */
async function hasGiftRingFlag(userId, lookbackDays = GIFT_RING_FLAG_LOOKBACK_DAYS) {
  if (!userId) return false;
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const found = await db.FraudEvent.exists({
    userId,
    eventType: 'gift',
    action: 'block',
    signals: 'gift_ring',
    createdAt: { $gte: since },
  });
  return !!found;
}

/**
 * Log gift sent for velocity tracking and fraud audit.
 */
async function logGiftSent(userId, amountCents, opts = {}) {
  const { refType, refId, ip } = opts;
  await db.FraudEvent.create({
    userId,
    eventType: 'gift',
    action: 'allow',
    refType: refType || 'gift',
    refId,
    ip,
    meta: { amountCents, ...(opts.meta || {}) },
  }).catch(() => {});
}

/**
 * Log PPV unlock for velocity tracking.
 */
async function logPpvUnlock(userId, amountCents, opts = {}) {
  const { refType, refId } = opts;
  await db.FraudEvent.create({
    userId,
    eventType: 'ppv_unlock',
    action: 'allow',
    refType: refType || 'ppv',
    refId,
    meta: { amountCents, ...opts.meta },
  }).catch(() => {});
}

/**
 * Log fraud event and return evaluation result.
 */
async function evaluateAndLogPayment(userId, amountCents, opts = {}) {
  const result = await evaluatePayment(userId, amountCents, opts);
  await db.FraudEvent.create({
    userId,
    eventType: 'payment',
    action: result.action,
    riskScore: result.riskScore,
    signals: result.signals,
    provider: 'internal',
    ip: opts.ip,
    userAgent: opts.userAgent,
    deviceFingerprint: opts.deviceFingerprint,
    refType: opts.refType || 'payment',
    refId: opts.refId,
    meta: { amountCents, ...opts.meta },
  }).catch(() => {});

  const amount = Math.max(0, Math.round(Number(amountCents) || 0));
  const currency = String(opts.currencyCode || 'USD').toUpperCase().slice(0, 3);
  const siftExtra = {
    $amount: amount * 10000,
    $currency_code: currency,
    $transaction_type: '$sale',
    $transaction_status: '$pending',
  };
  if (opts.refId != null && String(opts.refId).length > 0) {
    siftExtra.$order_id = String(opts.refId).slice(0, 255);
  }
  if (opts.deviceFingerprint && !opts.optOutFingerprinting) {
    siftExtra.$device = { $id: String(opts.deviceFingerprint).slice(0, 128) };
  }
  sendSiftEvent('$transaction', userId, {
    ip: opts.ip,
    userAgent: opts.userAgent,
    sessionId: opts.sessionId,
    extra: siftExtra,
  }).catch(() => {});

  await applyRiskEnforcement(userId, result.riskScore, {
    source: 'payment_fraud_eval',
    meta: { action: result.action, signals: result.signals },
  }).catch(() => {});
  return result;
}

/**
 * Build metadata for Stripe Radar. Pass to PaymentIntent or Checkout metadata.
 */
function getStripeRadarMetadata(userId, opts = {}) {
  const { ip, deviceFingerprint, userAgent } = opts;
  const meta = {
    user_id: String(userId || ''),
  };
  if (ip) meta.ip_address = ip;
  if (deviceFingerprint) meta.device_id = String(deviceFingerprint).slice(0, 100);
  if (userAgent) meta.user_agent = String(userAgent).slice(0, 200);
  return meta;
}

/**
 * Sift Science — optional. Set SIFT_API_KEY to enable.
 */
async function sendSiftEvent(eventType, userId, opts = {}) {
  const key = process.env.SIFT_API_KEY;
  if (!key) return null;
  try {
    const payload = {
      $type: eventType,
      $user_id: String(userId),
    };
    if (opts.ip) payload.$ip = opts.ip;
    if (opts.userAgent) payload.$user_agent = opts.userAgent;
    if (opts.sessionId) payload.$session_id = String(opts.sessionId);
    if (opts.extra && typeof opts.extra === 'object') Object.assign(payload, opts.extra);
    const res = await fetch('https://api.sift.com/v205/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(key + ':').toString('base64')}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('[fraud] Sift event failed:', res.status);
    return res.ok;
  } catch (err) {
    console.warn('[fraud] Sift error:', err?.message);
    return null;
  }
}

/**
 * Sift $login — call after a new session is created. Respects fingerprint opt-out (no $device).
 */
async function notifySiftLogin(userId, opts = {}) {
  if (!userId) return null;
  const {
    ip,
    userAgent,
    sessionId,
    deviceFingerprint,
    optOutFingerprinting,
    $user_email,
  } = opts;
  const extra = {};
  if ($user_email) extra.$user_email = String($user_email).slice(0, 255);
  if (deviceFingerprint && !optOutFingerprinting) {
    extra.$device = { $id: String(deviceFingerprint).slice(0, 128) };
  }
  return sendSiftEvent('$login', userId, {
    ip,
    userAgent,
    sessionId,
    extra,
  });
}

/**
 * Riskified — optional. Set RISKIFIED_ACCOUNT_ID and RISKIFIED_AUTH_KEY to enable.
 */
async function sendRiskifiedDecision(userId, orderId, opts = {}) {
  const accountId = process.env.RISKIFIED_ACCOUNT_ID;
  const authKey = process.env.RISKIFIED_AUTH_KEY;
  if (!accountId || !authKey) return null;
  try {
    const res = await fetch(`https://api.riskified.com/api/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${accountId}:${authKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        order_id: orderId,
        customer: { id: String(userId) },
        payment_details: opts.paymentDetails,
        ...opts.extra,
      }),
    });
    if (!res.ok) console.warn('[fraud] Riskified decision failed:', res.status);
    return res.ok;
  } catch (err) {
    console.warn('[fraud] Riskified error:', err?.message);
    return null;
  }
}

/**
 * Detect bot viewer spike — abnormal joins in short window.
 * Bot viewers artificially boost live streams. Returns { spikeDetected, count }.
 */
async function detectViewerSpike(streamId, opts = {}) {
  const windowMs = opts.windowMs ?? VIEWER_SPIKE_WINDOW_MS;
  const threshold = opts.threshold ?? VIEWER_SPIKE_THRESHOLD;
  const since = new Date(Date.now() - windowMs);
  const count = await db.LiveViewer.countDocuments({
    streamId,
    joinedAt: { $gte: since },
  });
  const spikeDetected = count > threshold;
  if (spikeDetected) {
    console.warn('[fraud] Bot viewer spike detected', { streamId: String(streamId), count, threshold });
    await db.FraudEvent.create({
      userId: null,
      eventType: 'viewer_spike',
      action: 'review',
      refType: 'stream',
      refId: String(streamId),
      meta: { count, threshold, windowMs },
    }).catch(() => {});
  }
  return { spikeDetected, count };
}

/** Default hold period: 7 days */
const PAYOUT_HOLD_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Payout risk engine: above this creator fraud score, hold payout. */
const PAYOUT_RISK_THRESHOLD = Number(process.env.PAYOUT_RISK_THRESHOLD) || 80;
const CREATOR_FRAUD_SCORE_WINDOW_DAYS = Number(process.env.CREATOR_FRAUD_SCORE_WINDOW_DAYS) || 90;
const CHARGEBACK_FRAUD_PENALTY = Number(process.env.CREATOR_FRAUD_CHARGEBACK_PENALTY) || 40;

/** Graph-based creator fraud: penalty when Neo4j detects self-funding (gifts from same-device accounts). */
const CREATOR_GRAPH_SELF_FUNDING_PENALTY = Number(process.env.CREATOR_GRAPH_SELF_FUNDING_PENALTY) || 50;

/** Payout hold system tiers: risk score < 40 immediate; 40–70 → 24h delay; > 70 → manual review. */
const PAYOUT_HOLD_TIER_IMMEDIATE_MAX = Number(process.env.PAYOUT_HOLD_TIER_IMMEDIATE_MAX) || 40;
const PAYOUT_HOLD_TIER_DELAY_MAX = Number(process.env.PAYOUT_HOLD_TIER_DELAY_MAX) || 70;
const PAYOUT_HOLD_DELAY_HOURS = Number(process.env.PAYOUT_HOLD_DELAY_HOURS) || 24;

/**
 * Get creator fraud score (0–100) for payout risk. Aggregates FraudEvents (userId or refType=creator) and chargebacks.
 */
async function getCreatorFraudScore(creatorId) {
  if (!creatorId) return 0;
  const cid = creatorId.toString?.() || creatorId;
  const since = new Date(Date.now() - CREATOR_FRAUD_SCORE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [maxUserRisk, maxCreatorRefRisk, chargebackCount] = await Promise.all([
    db.FraudEvent.findOne(
      { userId: cid, createdAt: { $gte: since }, riskScore: { $exists: true, $ne: null } },
      { sort: { riskScore: -1 }, limit: 1, lean: true }
    ).then((d) => d?.riskScore ?? 0),
    db.FraudEvent.findOne(
      { refType: 'creator', refId: cid, createdAt: { $gte: since }, riskScore: { $exists: true, $ne: null } },
      { sort: { riskScore: -1 }, limit: 1, lean: true }
    ).then((d) => d?.riskScore ?? 0),
    db.FraudEvent.countDocuments({ userId: cid, eventType: 'chargeback', createdAt: { $gte: since } }).catch(() => 0),
  ]);

  const chargebackPenalty = Math.min(100, chargebackCount * CHARGEBACK_FRAUD_PENALTY);
  let fraudScore = Math.min(100, Math.max(0, Math.round(Math.max(maxUserRisk, maxCreatorRefRisk, chargebackPenalty))));

  try {
    const neo4jClusterService = require('./neo4jClusterService');
    if (neo4jClusterService.isEnabled()) {
      const graph = await neo4jClusterService.getCreatorFraudGraphSignals(cid);
      if (graph.selfFundingGifts) {
        fraudScore = Math.min(100, Math.max(fraudScore, CREATOR_GRAPH_SELF_FUNDING_PENALTY));
      }
    }
  } catch (_) {}

  return fraudScore;
}

/**
 * Payout hold system: tier from risk score. < 40 → immediate; 40–70 → 24h delay; > 70 → manual review.
 * @param {number} fraudScore - 0–100
 * @returns {{ tier: 'immediate'|'delay_24h'|'manual_review', holdUntil?: Date }}
 */
function getPayoutHoldTier(fraudScore) {
  const score = Math.min(100, Math.max(0, Number(fraudScore)));
  if (score < PAYOUT_HOLD_TIER_IMMEDIATE_MAX) {
    return { tier: 'immediate', holdUntil: null };
  }
  if (score < PAYOUT_HOLD_TIER_DELAY_MAX) {
    const holdUntil = new Date(Date.now() + PAYOUT_HOLD_DELAY_HOURS * 60 * 60 * 1000);
    return { tier: 'delay_24h', holdUntil };
  }
  return { tier: 'manual_review', holdUntil: null };
}

/**
 * Payout risk engine: run fraud checks before paying creators. If fraudScore > threshold, hold payout.
 * When allowed, returns tier for the Payout Hold System (immediate / delay_24h / manual_review).
 * @param {string} creatorId
 * @param {number} [amountCents] - If provided and risk triggers hold, applyPayoutHold(creatorId, amountCents).
 * @returns {{ allowed: boolean, fraudScore: number, holdApplied?: boolean, tier?: string, holdUntil?: Date }}
 */
async function checkPayoutRisk(creatorId, amountCents) {
  const fraudScore = await getCreatorFraudScore(creatorId);
  await applyRiskEnforcement(creatorId, fraudScore, {
    source: 'creator_payout_fraud_score',
  }).catch(() => {});
  const threshold = PAYOUT_RISK_THRESHOLD;
  const allowed = fraudScore <= threshold;
  let holdApplied = false;
  if (!allowed && amountCents != null && amountCents > 0) {
    await applyPayoutHold(creatorId, amountCents, {
      reason: 'payout_risk_engine',
      meta: { fraudScore, threshold },
    }).catch(() => {});
    holdApplied = true;
  }
  const { tier, holdUntil } = getPayoutHoldTier(fraudScore);
  return { allowed, fraudScore, holdApplied, tier, holdUntil };
}

/**
 * Apply payout hold — high-risk earnings held until hold_until.
 * Call when fraud signals indicate creator is high-risk.
 */
async function applyPayoutHold(creatorId, amountCents, opts = {}) {
  const holdDaysMs = opts.holdDaysMs ?? PAYOUT_HOLD_DAYS_MS;
  const holdUntil = new Date(Date.now() + holdDaysMs);
  await db.PayoutHold.create({
    creatorId,
    amountCents,
    holdUntil,
    reason: opts.reason || 'high_risk',
    meta: opts.meta || {},
  });
}

/**
 * Apply shadow ban for fraud — instead of immediate ban. Effects: gifts not visible, revenue blocked, account monitored.
 */
async function applyShadowBanForFraud(userId, opts = {}) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return;
  const mongoose = require('mongoose');
  const SYSTEM_MODERATOR_ID = mongoose.Types.ObjectId.isValid('000000000000000000000001') ? new mongoose.Types.ObjectId('000000000000000000000001') : null;
  await db.User.updateOne({ _id: uid }, { $set: { shadowBanned: true } }).catch(() => {});
  await db.Profile.updateOne({ userId: uid }, { $set: { shadowBanned: true } }).catch(() => {});
  await db.AdminAuditLog.create({
    action: 'shadow_ban_fraud',
    adminId: opts.adminId || SYSTEM_MODERATOR_ID,
    targetType: 'User',
    targetId: uid,
    overrideReason: opts.reason || 'fraud_detection',
    meta: { source: 'fraud_service', ...(opts.meta || {}) },
  }).catch(() => {});
}

/**
 * Get total held amount for creator (active holds only).
 */
async function getHeldAmount(creatorId) {
  const holds = await db.PayoutHold.find({
    creatorId,
    holdUntil: { $gt: new Date() },
  }).lean();
  return holds.reduce((sum, h) => sum + (h.amountCents || 0), 0);
}

/**
 * Record a chargeback for fraud scoring (Phase 2). Creates FraudEvent.
 * @param {string} userId
 * @param {Object} opts - { chargebackId, amountCents, stripeDisputeId }
 */
async function recordChargeback(userId, opts = {}) {
  if (!userId) return;
  await db.FraudEvent.create({
    userId,
    eventType: 'chargeback',
    action: 'block',
    riskScore: 100,
    signals: ['chargeback_recorded'],
    provider: 'stripe',
    refType: 'chargeback',
    refId: opts.chargebackId || opts.stripeDisputeId,
    meta: { amountCents: opts.amountCents, stripeDisputeId: opts.stripeDisputeId },
  }).catch(() => {});
  await applyRiskEnforcement(userId, 100, {
    source: 'chargeback',
    meta: { chargebackId: opts.chargebackId, stripeDisputeId: opts.stripeDisputeId },
  }).catch(() => {});
}

/**
 * Flag support/fulfillment fraud: user claims NOT_DELIVERED but tracking shows DELIVERED.
 * Creates FraudEvent (eventType support_fraud, action review) for fraud team.
 */
async function flagSupportFraud(userId, reason, meta = {}) {
  if (!userId) return;
  await db.FraudEvent.create({
    userId,
    eventType: 'support_fraud',
    action: 'review',
    signals: Array.isArray(reason) ? reason : [reason],
    refType: 'support_ticket',
    refId: meta.supportTicketId || meta.refId || 'support_fraud',
    meta: { ...meta },
  }).catch(() => {});
}

module.exports = {
  recordDevice,
  evaluatePayment,
  evaluateAndLogPayment,
  checkPpvVelocity,
  logPpvUnlock,
  evaluateGiftRisk,
  checkGiftVelocity,
  checkCircularGifts,
  checkSameDeviceGift,
  checkSameIpGift,
  flagGiftFraud,
  checkSameDeviceSubscription,
  checkSubscriptionFarm,
  checkSubscriptionRefundLoop,
  flagSubscriptionFraud,
  hasSubscriptionFraudFlag,
  checkSameDeviceAuctionBid,
  checkAuctionBidCluster,
  checkLastSecondBidPattern,
  flagAuctionBidFraud,
  hasAuctionBidFraudFlag,
  AUCTION_BID_CLUSTER_MAX_BIDS_PER_BIDDER,
  AUCTION_LAST_SECOND_WINDOW_SEC,
  AUCTION_LAST_SECOND_MAX_BIDS,
  getGiftGraphEdges,
  findGiftRingClusters,
  detectGiftRings,
  flagGiftRing,
  runGiftRingDetectionAndFlag,
  hasGiftRingFlag,
  blockSelfGift,
  hasRecentChargebacks,
  GIFT_RING_WINDOW_DAYS,
  GIFT_RING_TRANSACTION_THRESHOLD,
  checkIpReputation: ipReputation.checkIpReputation,
  applyShadowBanForFraud,
  detectViewerSpike,
  getCreatorFraudScore,
  getPayoutHoldTier,
  checkPayoutRisk,
  PAYOUT_RISK_THRESHOLD,
  PAYOUT_HOLD_TIER_IMMEDIATE_MAX,
  PAYOUT_HOLD_TIER_DELAY_MAX,
  PAYOUT_HOLD_DELAY_HOURS,
  applyPayoutHold,
  getHeldAmount,
  logGiftSent,
  getGiftVelocityLimits,
  checkGiftValuePerHour,
  checkMultiAccount,
  getStripeRadarMetadata,
  sendSiftEvent,
  notifySiftLogin,
  sendRiskifiedDecision,
  recordChargeback,
  flagSupportFraud,
  paymentEvaluateBlockThreshold,
  paymentEvaluateReviewThreshold,
};
