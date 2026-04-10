/**
 * Frequency cap — limit impressions per user/device per time window. Stub: in-memory.
 * https://milloapp.com
 */
const MAX_IMPRESSIONS_PER_HOUR = Number(process.env.ADS_FREQUENCY_CAP_PER_HOUR) || 10;
const WINDOW_MS = 60 * 60 * 1000;

const counts = new Map();

function key(placement, userIdOrAnonymous) {
  return placement + ':' + (userIdOrAnonymous || 'anon');
}

function prune() {
  const now = Date.now();
  for (const [k, v] of counts.entries()) {
    if (v.expiry < now) counts.delete(k);
  }
}

function canShowByFrequency(placement, userIdOrAnonymousId) {
  prune();
  const k = key(placement, userIdOrAnonymousId);
  const rec = counts.get(k);
  const now = Date.now();
  if (!rec) {
    counts.set(k, { count: 1, expiry: now + WINDOW_MS });
    return true;
  }
  if (rec.expiry < now) {
    rec.count = 1;
    rec.expiry = now + WINDOW_MS;
    return true;
  }
  if (rec.count >= MAX_IMPRESSIONS_PER_HOUR) return false;
  rec.count++;
  return true;
}

function recordImpression(placement, userIdOrAnonymousId) {
  prune();
  const k = key(placement, userIdOrAnonymousId);
  const rec = counts.get(k);
  const now = Date.now();
  if (!rec) counts.set(k, { count: 1, expiry: now + WINDOW_MS });
  else if (rec.expiry >= now) rec.count++;
}

module.exports = { canShowByFrequency, recordImpression, MAX_IMPRESSIONS_PER_HOUR };
