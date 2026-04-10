/**
 * DM sessions — start/end, creator approval, charge when approved.
 * https://milloapp.com
 */
const db = require('@millo/database');
const economy = require('@millo/economy');
const billing = require('./billing');

async function startSession(creatorId, userId) {
  const session = await db.DMSession.create({
    creatorId,
    userId,
    startedAt: new Date(),
  });
  return session.toObject();
}

async function endSession(sessionId) {
  const session = await db.DMSession.findById(sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.endedAt) return session.toObject();
  session.endedAt = new Date();
  const totalMinutes = (session.endedAt - session.startedAt) / (60 * 1000);
  session.totalMinutes = totalMinutes;
  const freeBuffer = billing.getFreeBufferMinutes();
  session.freeBufferMinutes = freeBuffer;
  const { billableMinutes, amountCents } = billing.computeCharge(totalMinutes, freeBuffer);
  session.billableMinutes = billableMinutes;
  session.amountCents = amountCents;
  await session.save();
  return session.toObject();
}

async function approveSession(sessionId, creatorId) {
  const session = await db.DMSession.findById(sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.creatorId.toString() !== creatorId.toString()) throw new Error('UNAUTHORIZED');
  session.approved = true;
  await session.save();
  if (session.amountCents > 0 && !session.charged) {
    await economy.debit(session.userId, session.amountCents, 'dm_session', sessionId.toString(), { creatorId: creatorId.toString() });
    await economy.credit(session.creatorId, session.amountCents, 'dm_session', sessionId.toString(), { userId: session.userId.toString() });
    session.charged = true;
    await session.save();
  }
  return session.toObject();
}

async function getSession(sessionId) {
  const session = await db.DMSession.findById(sessionId).lean();
  return session;
}

module.exports = { startSession, endSession, approveSession, getSession };
