/**
 * Idempotency — same key returns same result; no duplicate charges/payouts.
 * Persists failed attempts so retries replay deterministically.
 * https://milloapp.com
 */
const db = require('@millo/database');

const TTL_MS = 24 * 60 * 60 * 1000;

function normalizeKey(key) {
  if (key == null || !String(key).trim()) {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  }
  return String(key).trim().slice(0, 512);
}

/**
 * @param {string} key
 * @param {() => Promise<any>} fn
 */
async function executeWithIdempotency(key, fn) {
  const k = normalizeKey(key);
  const existing = await db.IdempotencyRecord.findOne({ key: k }).lean();
  if (existing) {
    if (existing.status === 'failed' && existing.result && existing.result.error) {
      const err = new Error(String(existing.result.error));
      err.code = 'IDEMPOTENT_REPLAY';
      err.idempotent = true;
      throw err;
    }
    return existing.result;
  }

  let result;
  try {
    result = await fn();
  } catch (e) {
    try {
      await db.IdempotencyRecord.create({
        key: k,
        result: { error: e.message, code: e.code },
        status: 'failed',
        expiresAt: new Date(Date.now() + TTL_MS),
      });
    } catch (dup) {
      if (dup.code === 11000) {
        const again = await db.IdempotencyRecord.findOne({ key: k }).lean();
        if (again?.status === 'failed' && again.result?.error) {
          const err = new Error(String(again.result.error));
          err.code = 'IDEMPOTENT_REPLAY';
          err.idempotent = true;
          throw err;
        }
        if (again) return again.result;
      }
    }
    throw e;
  }

  try {
    await db.IdempotencyRecord.create({
      key: k,
      result,
      status: 'completed',
      expiresAt: new Date(Date.now() + TTL_MS),
    });
  } catch (dup) {
    if (dup.code === 11000) {
      const again = await db.IdempotencyRecord.findOne({ key: k }).lean();
      if (again) {
        if (again.status === 'failed' && again.result?.error) {
          const err = new Error(String(again.result.error));
          err.code = 'IDEMPOTENT_REPLAY';
          err.idempotent = true;
          throw err;
        }
        return again.result;
      }
    }
    throw dup;
  }
  return result;
}

module.exports = { executeWithIdempotency };
