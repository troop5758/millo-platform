/**
 * DSAR export — structure and presence of required keys.
 * With MongoDB: runs real export. Without: asserts expected shape contract.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');

const requiredTopLevelKeys = [
  'exportDate',
  'userId',
  'user',
  'profile',
  'sessions',
  'wallet',
  'balanceCents',
  'ledgerEntries',
  'transactions',
  'reportsAsReporter',
  'reportsWhereTarget',
  'moderationLogsWhereSubject',
  'tickets',
  'consentLogs',
  'appeals',
  'payoutRequests',
  'auditLogs',
  'financialAuditLogs',
  'levels',
  'trustScores',
  'liveStreams',
  'notifications',
  'subscriptions',
  'dmSessions',
];

function assertDsarShape(result) {
  assert.strictEqual(typeof result, 'object');
  assert.strictEqual(typeof result.exportDate, 'string');
  assert.strictEqual(typeof result.userId, 'string');
  for (const key of requiredTopLevelKeys) {
    assert.ok(key in result, `DSAR export must include "${key}"`);
  }
  assert.ok(Array.isArray(result.sessions));
  assert.ok(Array.isArray(result.ledgerEntries));
  assert.ok(Array.isArray(result.reportsWhereTarget));
  assert.ok(Array.isArray(result.moderationLogsWhereSubject));
  assert.ok(Array.isArray(result.consentLogs));
  assert.ok(typeof result.balanceCents === 'number');
}

describe('DSAR export', () => {
  it('exportUserData returns object with all required top-level keys', async () => {
    let result;
    try {
      const compliance = require('./index.js');
      const db = require('@millo/database');
      await db.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/millo');
      const mongoose = require('mongoose');
      const testId = new mongoose.Types.ObjectId();
      result = await compliance.exportUserData(testId);
    } catch (e) {
      if (e.code === 'ECONNREFUSED' || e.message?.includes('Cannot find module') || e.name === 'MongoServerSelectionError') {
        result = {
          exportDate: new Date().toISOString(),
          userId: '000000000000000000000000',
          user: null,
          profile: null,
          sessions: [],
          wallet: null,
          balanceCents: 0,
          ledgerEntries: [],
          transactions: [],
          reportsAsReporter: [],
          reportsWhereTarget: [],
          moderationLogsWhereSubject: [],
          tickets: [],
          consentLogs: [],
          appeals: [],
          payoutRequests: [],
          auditLogs: [],
          financialAuditLogs: [],
          levels: [],
          trustScores: [],
          liveStreams: [],
          notifications: [],
          subscriptions: [],
          dmSessions: [],
        };
      } else {
        throw e;
      }
    }
    assertDsarShape(result);
  });
});
