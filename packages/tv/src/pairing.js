/**
 * TV device pairing — required for Apple TV / Android TV. https://milloapp.com
 */
const db = require('@millo/database');
const crypto = require('crypto');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function createPairingCode(userId) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await db.TVPairingCode.create({ code, userId, expiresAt });
  return { code, expiresAt: expiresAt.toISOString() };
}

async function pairDevice(code, deviceId, platform) {
  if (!['apple_tv', 'android_tv'].includes(platform)) throw new Error('INVALID_PLATFORM');
  const now = new Date();
  const record = await db.TVPairingCode.findOneAndUpdate(
    { code: code.toUpperCase().replace(/\s/g, ''), usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true }
  );
  if (!record) throw new Error('INVALID_OR_EXPIRED_CODE');
  const existing = await db.TVDevice.findOne({ deviceId });
  if (existing) {
    existing.userId = record.userId;
    existing.platform = platform;
    existing.lastSeenAt = now;
    await existing.save();
    return { userId: record.userId.toString(), deviceId, platform, paired: true };
  }
  await db.TVDevice.create({
    userId: record.userId,
    deviceId,
    platform,
    lastSeenAt: now,
  });
  return { userId: record.userId.toString(), deviceId, platform, paired: true };
}

async function isPaired(deviceId) {
  const device = await db.TVDevice.findOne({ deviceId }).lean();
  return !!device;
}

async function getPairedDevices(userId) {
  const devices = await db.TVDevice.find({ userId }).select('-meta').lean();
  return devices.map((d) => ({
    deviceId: d.deviceId,
    platform: d.platform,
    pairedAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
  }));
}

module.exports = { createPairingCode, pairDevice, isPaired, getPairedDevices };
