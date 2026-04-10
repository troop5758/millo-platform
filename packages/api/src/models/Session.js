'use strict';
/**
 * Re-export authoritative Session model from `@millo/database`.
 *
 * Conceptual shape (tracking):
 * - `userId` — Mongo ObjectId ref `User` (not a plain string in the DB)
 * - `deviceId` — client / fingerprint hint when provided at login
 * - `ip` / `ipAddress` — request IP when session was created or last refreshed
 * - `createdAt` / `updatedAt` — from schema `{ timestamps: true }`
 * - plus: `token`, `expiresAt`, `userAgent`, `deviceName`, `location`, `lastSeen`, `lastActiveAt`, `revoked`, `meta`
 *
 * Prefer `db.Session.create({ ... })` via `@millo/database`; this module is for API-layer imports only.
 * https://milloapp.com
 */
const { Session } = require('@millo/database');

module.exports = Session;
