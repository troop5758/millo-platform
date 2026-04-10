/**
 * Ledger integration — immutable append-only. Every financial mutation logs here.
 * Sequence allocation uses `Counter` (atomic $inc) to avoid duplicate / gap under concurrency.
 * https://milloapp.com
 */
const db = require('@millo/database');

const LEDGER_SEQ_COUNTER = 'millo_ledger_entry_sequence';

/**
 * Seed Counter from max(existing sequence) when missing (idempotent for concurrent workers).
 */
async function seedLedgerSequenceCounterIfMissing() {
  const existing = await db.Counter.findOne({ name: LEDGER_SEQ_COUNTER }).lean();
  if (existing) return;
  const r = await db.LedgerEntry.aggregate([{ $group: { _id: null, max: { $max: '$sequence' } } }]);
  const max = Math.max(0, Math.floor(Number(r[0]?.max) || 0));
  try {
    await db.Counter.create({ name: LEDGER_SEQ_COUNTER, value: max });
  } catch (e) {
    if (e && e.code !== 11000) throw e;
  }
}

async function getNextSequence() {
  for (let attempt = 0; attempt < 8; attempt++) {
    await seedLedgerSequenceCounterIfMissing();
    const doc = await db.Counter.findOneAndUpdate(
      { name: LEDGER_SEQ_COUNTER },
      { $inc: { value: 1 } },
      { new: true }
    ).lean();
    if (doc && Number.isFinite(doc.value)) {
      return doc.value;
    }
  }
  throw new Error('LEDGER_SEQUENCE_UNAVAILABLE');
}

async function appendEntry(entry, opts = {}) {
  const { type, actorId, amountCents, balanceAfterCents, refType, refId, meta } = entry;
  let sequence;
  for (let attempt = 0; attempt < 10; attempt++) {
    sequence = await getNextSequence();
    try {
      await db.LedgerEntry.create({
        sequence,
        type,
        actorId,
        amountCents,
        balanceAfterCents,
        refType,
        refId,
        meta: meta || {},
      });
      return sequence;
    } catch (e) {
      if (e.code === 11000) continue;
      throw e;
    }
  }
  throw new Error('LEDGER_SEQUENCE_CONFLICT');
}

function balanceFromLedger(entries) {
  return entries.reduce((sum, e) => sum + (e.amountCents || 0), 0);
}

async function getLedgerBalance(userId) {
  const entries = await db.LedgerEntry.find({ actorId: userId }).lean().sort({ sequence: 1 });
  return balanceFromLedger(entries);
}

/**
 * Ledger tamper detection — unique, strictly increasing `sequence` (gaps allowed after atomic allocator retries).
 */
async function verifyLedgerIntegrity() {
  const entries = await db.LedgerEntry.find({}).sort({ sequence: 1 }).lean();
  const seen = new Set();
  let prev = -Infinity;
  for (const e of entries) {
    if (seen.has(e.sequence)) return { valid: false, reason: 'duplicate_sequence', sequence: e.sequence };
    seen.add(e.sequence);
    if (!(e.sequence > prev)) return { valid: false, reason: 'out_of_order_or_duplicate_value', sequence: e.sequence };
    prev = e.sequence;
  }
  return { valid: true, totalEntries: entries.length };
}

module.exports = { appendEntry, getNextSequence, balanceFromLedger, getLedgerBalance, verifyLedgerIntegrity };
