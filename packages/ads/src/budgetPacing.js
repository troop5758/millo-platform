/**
 * Budget pacing — daily spend cap per campaign. https://milloapp.com
 */
const db = require('@millo/database');

function getDateKey(d) {
  const t = d || new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

async function getSpendToday(campaignId) {
  const today = getDateKey(new Date());
  const doc = await db.AdDailySpend.findOne({ campaignId, date: today }).lean();
  return doc?.amountCents ?? 0;
}

async function canSpend(campaignId, dailyBudgetCents) {
  if (dailyBudgetCents <= 0) return true;
  const spent = await getSpendToday(campaignId);
  return spent < dailyBudgetCents;
}

async function recordSpend(campaignId, amountCents) {
  const today = getDateKey(new Date());
  await db.AdDailySpend.findOneAndUpdate(
    { campaignId, date: today },
    { $inc: { amountCents } },
    { upsert: true, new: true }
  );
}

module.exports = { getSpendToday, canSpend, recordSpend };
