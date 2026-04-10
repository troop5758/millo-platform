'use strict';
/**
 * Password-login risk-based auth — geo/device/behavior/failed-attempt score + LoginEvent + Trust Graph hint.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { scoreLoginRisk, decide } = require('./riskEngine.service');
const { getGeo } = require('./ip.service');
const behaviorProfile = require('./behaviorProfile.service');
const neo4jClusterService = require('./neo4jClusterService');

async function refreshBaselineIfEmpty(sec) {
  const b = sec.baselineBehavior;
  const has = b && typeof b === 'object' && Object.keys(b).length > 0;
  if (has) return b;
  const baseline = await behaviorProfile.getBehaviorBaselineProfile(sec.userId).catch(() => null);
  if (baseline) {
    sec.baselineBehavior = baseline;
    await sec.save().catch(() => {});
  }
  return baseline || null;
}

/**
 * @param {object} params
 * @param {object} params.user - lean user
 * @param {object} params.request - Fastify request
 * @param {import('mongoose').Document} params.sec - UserSecurity doc
 * @param {string|null} params.deviceId
 * @param {object|null} params.behaviorPayload - body.behavior (mouse/clicks/keystrokes)
 */
async function computeRba(params = {}) {
  const { user, request, sec, deviceId, behaviorPayload } = params;
  const ip = request?.ip ? String(request.ip).slice(0, 64) : '';
  const country = getGeo(ip || '');
  await refreshBaselineIfEmpty(sec);
  const baseline =
    sec.baselineBehavior && typeof sec.baselineBehavior === 'object' && Object.keys(sec.baselineBehavior).length > 0
      ? sec.baselineBehavior
      : null;
  const id = deviceId ? String(deviceId).trim().slice(0, 256) : '';
  const isNewDevice = id ? !(sec.knownDevices || []).includes(id) : true;
  const isNewIp = ip ? !(sec.lastIps || []).includes(ip) : true;
  const geoMismatch =
    (sec.lastCountries || []).length > 0
    && country
    && country !== 'UNKNOWN'
    && !(sec.lastCountries || []).includes(country);
  const behaviorAnomaly = baseline
    ? behaviorProfile.detectAnomaly(behaviorPayload || {}, baseline) > 40
    : false;
  const failedAttempts = sec.failedAttempts || 0;
  const inputs = { isNewDevice, isNewIp, geoMismatch, behaviorAnomaly, failedAttempts };
  const risk = scoreLoginRisk(inputs);
  const decision = decide(risk);
  return {
    risk,
    decision,
    country,
    behaviorAnomaly,
    inputs,
    baseline,
  };
}

async function recordLoginEvent({ userId, deviceId, ip, country, userAgent, success, riskScore, decision }) {
  if (!userId) return;
  await db.LoginEvent.create({
    userId,
    deviceId: deviceId ? String(deviceId).slice(0, 256) : undefined,
    ip: ip ? String(ip).slice(0, 64) : undefined,
    country: country || undefined,
    userAgent: userAgent ? String(userAgent).slice(0, 512) : undefined,
    success: !!success,
    riskScore,
    decision,
  }).catch(() => {});
}

function trustGraphLoginAttempt(userId, deviceId, userAgent, risk) {
  if (!deviceId || !neo4jClusterService.isEnabled()) return;
  neo4jClusterService
    .linkUserDevice(String(userId), String(deviceId).slice(0, 256), {
      userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
      loginRisk: Number(risk) || 0,
    })
    .catch(() => {});
}

module.exports = {
  computeRba,
  recordLoginEvent,
  trustGraphLoginAttempt,
};
