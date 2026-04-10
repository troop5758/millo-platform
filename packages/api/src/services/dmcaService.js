'use strict';
/**
 * DMCA service — takedown notices, counter-notices, content removal, repeat infringer.
 * 17 USC § 512. https://milloapp.com
 */
const db = require('@millo/database');

const REPEAT_INFRINGER_THRESHOLD = Number(process.env.DMCA_REPEAT_INFRINGER_THRESHOLD) || 3;
const COUNTER_NOTICE_DAYS = 10; // Business days before eligible restore

/**
 * Resolve target (stream/event/product) to content owner userId.
 */
async function resolveContentOwner(targetType, targetId) {
  if (!targetId) return null;
  if (targetType === 'stream') {
    const s = await db.LiveStream.findById(targetId).select('userId').lean();
    return s?.userId || null;
  }
  if (targetType === 'event') {
    const e = await db.LiveEvent.findById(targetId).select('creatorId').lean();
    return e?.creatorId || null;
  }
  if (targetType === 'product') {
    const p = await db.Product.findById(targetId).select('creatorId').lean();
    return p?.creatorId || null;
  }
  return null;
}

/**
 * Apply takedown to content: set removedAt, removalReason, dmcaNoticeId.
 */
async function applyTakedown(targetType, targetId, noticeId) {
  const now = new Date();
  if (targetType === 'stream') {
    await db.LiveStream.updateOne(
      { _id: targetId },
      { $set: { removedAt: now, removalReason: 'dmca', dmcaNoticeId: noticeId } }
    );
  }
  // Event and product: same pattern if they have removal fields; else only log
  const notice = await db.DmcaNotice.findById(noticeId);
  if (notice?.contentOwnerId) {
    await db.User.updateOne(
      { _id: notice.contentOwnerId },
      { $inc: { 'flags.dmcaTakedownCount': 1 } }
    );
  }
}

/**
 * Remove takedown (restore content).
 */
async function applyRestore(targetType, targetId) {
  if (targetType === 'stream') {
    await db.LiveStream.updateOne(
      { _id: targetId },
      { $set: { removedAt: null, removalReason: null, dmcaNoticeId: null } }
    );
  }
}

/**
 * Create and optionally process a DMCA takedown notice.
 * Returns { notice, takenDown }.
 */
async function submitTakedownNotice(payload, request = null) {
  const {
    claimantName,
    claimantEmail,
    claimantAddress,
    signature,
    workDescription,
    workUrl,
    targetType,
    targetId,
    infringingUrls,
    goodFaithStatement,
    accuracyStatement,
  } = payload;

  if (!claimantName?.trim() || !claimantEmail?.trim() || !workDescription?.trim() || !targetType || !targetId) {
    throw new Error('DMCA_MISSING_REQUIRED');
  }
  const validTypes = ['stream', 'event', 'product', 'content'];
  if (!validTypes.includes(targetType)) throw new Error('DMCA_INVALID_TARGET_TYPE');

  const contentOwnerId = await resolveContentOwner(targetType, targetId);
  const notice = await db.DmcaNotice.create({
    claimantName: claimantName.trim(),
    claimantEmail: claimantEmail.trim().toLowerCase(),
    claimantAddress: (claimantAddress || '').trim(),
    signature: (signature || '').trim(),
    workDescription: workDescription.trim(),
    workUrl: (workUrl || '').trim(),
    targetType,
    targetId,
    infringingUrls: Array.isArray(infringingUrls) ? infringingUrls.filter(Boolean) : [],
    goodFaithStatement: (goodFaithStatement || '').trim(),
    accuracyStatement: (accuracyStatement || '').trim(),
    status: 'pending',
    contentOwnerId: contentOwnerId || undefined,
  });

  return { notice };
}

/**
 * Accept notice and take down content. Called by admin or automated after review.
 */
async function acceptNoticeAndTakedown(noticeId, adminId) {
  const notice = await db.DmcaNotice.findById(noticeId);
  if (!notice) throw new Error('DMCA_NOTICE_NOT_FOUND');
  if (notice.status !== 'pending') throw new Error('DMCA_NOTICE_ALREADY_PROCESSED');

  await applyTakedown(notice.targetType, notice.targetId, noticeId);
  const now = new Date();
  notice.status = 'taken_down';
  notice.reviewedBy = adminId;
  notice.reviewedAt = now;
  notice.takenDownAt = now;
  notice.notifiedAt = now;
  await notice.save();

  return notice;
}

/**
 * Notify content owner of takedown (call from route after acceptNoticeAndTakedown).
 */
async function notifyContentOwnerOfTakedown(noticeId) {
  const notice = await db.DmcaNotice.findById(noticeId).lean();
  if (!notice?.contentOwnerId) return;
  const { notifyUser } = require('../lib/notifyUser');
  await notifyUser(notice.contentOwnerId, {
    type: 'dmca_takedown',
    title: 'Content removed — DMCA notice',
    body: 'Your content was removed due to a copyright takedown notice. You may submit a counter-notice if you believe this was a mistake.',
    meta: { noticeId: String(notice._id), targetType: notice.targetType, targetId: String(notice.targetId) },
  }).catch(() => {});
}

/**
 * Submit counter-notice (authenticated content owner).
 */
async function submitCounterNotice(noticeId, userId, payload) {
  const notice = await db.DmcaNotice.findById(noticeId);
  if (!notice) throw new Error('DMCA_NOTICE_NOT_FOUND');
  if (notice.status !== 'taken_down') throw new Error('DMCA_NOT_COUNTER_NOTICE_ELIGIBLE');
  if (String(notice.contentOwnerId) !== String(userId)) throw new Error('DMCA_NOT_CONTENT_OWNER');

  const { signerName, signerEmail, signerAddress, goodFaithStatement, consentToJurisdiction } = payload;
  if (!signerName?.trim() || !signerEmail?.trim()) throw new Error('DMCA_COUNTER_MISSING_REQUIRED');

  const now = new Date();
  const restoreAfter = new Date(now);
  restoreAfter.setDate(restoreAfter.getDate() + COUNTER_NOTICE_DAYS);

  notice.counterNotice = {
    submittedAt: now,
    signerName: signerName.trim(),
    signerEmail: signerEmail.trim(),
    signerAddress: (signerAddress || '').trim(),
    goodFaithStatement: (goodFaithStatement || '').trim(),
    consentToJurisdiction: !!consentToJurisdiction,
    restoreAfter,
  };
  await notice.save();

  return notice;
}

/**
 * Notify claimant of counter-notice (call from route).
 */
async function notifyClaimantOfCounterNotice(noticeId) {
  const notice = await db.DmcaNotice.findById(noticeId).lean();
  if (!notice?.claimantEmail) return;
  const { sendEmailWithInboxFallback } = require('./notificationService');
  const appName = process.env.APP_NAME || 'Millo';
  await sendEmailWithInboxFallback({
    to: notice.claimantEmail,
    subject: `Counter-notice received — ${appName} DMCA`,
    title: 'Counter-notice received',
    body: `A counter-notice has been submitted for the content that was the subject of your DMCA takedown notice. If you do not file a court action to restrain the activity, the content may be restored after the statutory period.`,
    ctaUrl: process.env.FRONTEND_URL || 'https://milloapp.com',
    ctaText: 'Help Center',
    // Claimant may not have a platform account; so no userId fallback here.
  }).catch(() => {});
}

/**
 * Restore content after counter-notice period (no lawsuit filed). Call from admin or cron.
 */
async function restoreAfterCounterNotice(noticeId) {
  const notice = await db.DmcaNotice.findById(noticeId);
  if (!notice) throw new Error('DMCA_NOTICE_NOT_FOUND');
  if (!notice.counterNotice?.restoreAfter) throw new Error('DMCA_NO_COUNTER_NOTICE');
  if (notice.counterNotice.lawsuitFiled) throw new Error('DMCA_LAWSUIT_FILED');
  if (new Date() < new Date(notice.counterNotice.restoreAfter)) throw new Error('DMCA_RESTORE_DATE_NOT_REACHED');

  await applyRestore(notice.targetType, notice.targetId);
  notice.counterNotice.restoredAt = new Date();
  await notice.save();
  return notice;
}

/**
 * Mark that claimant filed court action (do not restore).
 */
async function markLawsuitFiled(noticeId) {
  const notice = await db.DmcaNotice.findById(noticeId);
  if (!notice) throw new Error('DMCA_NOTICE_NOT_FOUND');
  if (!notice.counterNotice) throw new Error('DMCA_NO_COUNTER_NOTICE');
  notice.counterNotice.lawsuitFiled = true;
  await notice.save();
  return notice;
}

/**
 * Check if user is repeat infringer (at or above threshold).
 */
async function isRepeatInfringer(userId) {
  const user = await db.User.findById(userId).select('flags').lean();
  const count = user?.flags?.dmcaTakedownCount ?? 0;
  return count >= REPEAT_INFRINGER_THRESHOLD;
}

/**
 * Get DMCA agent from env for policy page and API.
 */
function getDmcaAgent() {
  return {
    name: process.env.DMCA_AGENT_NAME || 'DMCA Agent',
    address: process.env.DMCA_AGENT_ADDRESS || 'Millo, Inc.',
    email: process.env.DMCA_AGENT_EMAIL || 'dmca@milloapp.com',
  };
}

module.exports = {
  submitTakedownNotice,
  acceptNoticeAndTakedown,
  notifyContentOwnerOfTakedown,
  submitCounterNotice,
  notifyClaimantOfCounterNotice,
  restoreAfterCounterNotice,
  markLawsuitFiled,
  resolveContentOwner,
  isRepeatInfringer,
  getDmcaAgent,
  REPEAT_INFRINGER_THRESHOLD,
};
