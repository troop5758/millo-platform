'use strict';
/**
 * Part 8 — Device fingerprinting (canonical hash for server/client parity).
 * fingerprint = SHA-256( userAgent + ip + screen + timezone ) as UTF-8 bytes.
 * Uses a fixed field separator so field boundaries are unambiguous (avoids collision from naive concat).
 * https://milloapp.com
 */
const crypto = require('crypto');

/** Internal separator — not secret; must match any client that recomputes the hash. */
const FIELD_SEP = '\u241e'; // Unicode SYMBOL FOR RECORD SEPARATOR

/**
 * @param {{ userAgent?: string, ip?: string, screen?: string, timezone?: string }} parts
 * @returns {string} 64-char hex SHA-256
 */
function hashDeviceFingerprint(parts = {}) {
  const userAgent = String(parts.userAgent ?? '');
  const ip = String(parts.ip ?? '');
  const screen = String(parts.screen ?? '');
  const timezone = String(parts.timezone ?? '');
  const payload = [userAgent, ip, screen, timezone].join(FIELD_SEP);
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

module.exports = {
  hashDeviceFingerprint,
  /** Exposed for mobile/web SDKs that must match server hashing. */
  FIELD_SEP,
};
