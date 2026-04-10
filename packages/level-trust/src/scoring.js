/**
 * Server-side scoring — Level & Trust. Audit logging on mutations.
 * https://milloapp.com
 */
const db = require('@millo/database');

const { xpRequiredForLevel, trustTierForScore } = require('./constants');

async function getLevel(userId) {
  const Level = db.Level;
  const doc = await Level.findOne({ userId }).lean();
  if (!doc) return { level: 1, xp: 0 };
  return { level: doc.level, xp: doc.xp };
}

async function addXp(userId, amount, source = 'activity') {
  if (amount <= 0) return getLevel(userId);
  const Level = db.Level;
  let doc = await Level.findOne({ userId });
  if (!doc) doc = await Level.create({ userId, level: 1, xp: 0 });
  const xpRequired = xpRequiredForLevel(doc.level + 1);
  let xp = doc.xp + amount;
  let level = doc.level;
  while (xp >= xpRequired && level < 999) {
    xp -= xpRequired;
    level += 1;
  }
  doc.xp = xp;
  doc.level = level;
  await doc.save();

  await db.AuditLog.create({
    action: 'level.xp.add',
    actorId: userId,
    resourceType: 'Level',
    resourceId: doc._id.toString(),
    meta: { amount, source, level, xp },
  });
  return getLevel(userId);
}

async function getTrust(userId) {
  const TrustScore = db.TrustScore;
  const rows = await TrustScore.find({ userId }).lean();
  const score = rows.reduce((sum, r) => sum + (r.score || 0), 0);
  return Math.max(0, score);
}

async function addTrust(userId, amount, source = 'activity') {
  const TrustScore = db.TrustScore;
  await TrustScore.create({ userId, score: amount, source });
  const newTotal = await getTrust(userId);

  await db.AuditLog.create({
    action: 'trust.add',
    actorId: userId,
    resourceType: 'TrustScore',
    resourceId: userId.toString(),
    meta: { amount, source, total: newTotal },
  });
  return newTotal;
}

/**
 * Get trust tier for user (from current trust total).
 * @returns {{ name: string, minScore: number, nextTierAt: number | null }}
 */
async function getTrustTier(userId) {
  const trust = await getTrust(userId);
  return trustTierForScore(trust);
}

module.exports = { getLevel, addXp, getTrust, addTrust, getTrustTier };
