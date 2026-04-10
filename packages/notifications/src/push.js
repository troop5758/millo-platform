/**
 * Push notifications — Expo Push API + FCM + APNs delivery.
 * Sends to all registered device tokens for a user.
 * Requires: EXPO_ACCESS_TOKEN env var (optional but recommended for Expo)
 *           FIREBASE_SERVER_KEY env var (for raw FCM legacy API)
 * https://milloapp.com
 */
'use strict';
const https   = require('https');
const branding = require('./branding');

/* ── Expo Push API (handles both FCM + APNs via Expo's service) ── */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function buildPushPayload(options = {}) {
  const { title = '', body = '', data = {}, imageUrl } = options;
  return {
    notification: {
      title: title || branding.getAppName(),
      body:  body  || '',
      image: imageUrl || undefined,
    },
    data: { ...data },
    android: {
      priority: 'high',
      notification: { channelId: 'millo_default', sound: 'default' },
    },
    apns: {
      payload: { aps: { sound: 'default', 'mutable-content': 1 } },
      fcm_options: {},
    },
  };
}

/**
 * Send via Expo Push API (supports iOS + Android Expo tokens).
 * @param {string[]} expoPushTokens  array of "ExponentPushToken[...]" strings
 * @param {{ title, body, data, imageUrl }} payload
 */
async function sendViaExpo(expoPushTokens, payload) {
  if (!expoPushTokens || expoPushTokens.length === 0) return [];
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  const messages = expoPushTokens.map((token) => ({
    to:       token,
    sound:    'default',
    title:    payload.title  || branding.getAppName(),
    body:     payload.body   || '',
    data:     payload.data   || {},
    channelId:'millo_default',
    priority: 'high',
    ...(payload.imageUrl ? { _displayInForeground: true } : {}),
  }));

  return new Promise((resolve) => {
    const body = JSON.stringify(messages);
    const headers = {
      'Content-Type':   'application/json',
      Accept:           'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const opts = {
      hostname: 'exp.host',
      port:     443,
      path:     '/--/api/v2/push/send',
      method:   'POST',
      headers,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data).data || []); }
        catch { resolve([]); }
      });
    });
    req.on('error', (e) => { console.warn('[Push] Expo error:', e.message); resolve([]); });
    req.write(body);
    req.end();
  });
}

/**
 * Send via FCM Legacy HTTP API (raw FCM tokens from Android).
 */
async function sendViaFCM(fcmTokens, payload) {
  const serverKey = process.env.FIREBASE_SERVER_KEY;
  if (!serverKey || !fcmTokens || fcmTokens.length === 0) return;

  const body = JSON.stringify({
    registration_ids: fcmTokens,
    notification: {
      title: payload.title || branding.getAppName(),
      body:  payload.body  || '',
      sound: 'default',
    },
    data:     payload.data || {},
    priority: 'high',
  });

  return new Promise((resolve) => {
    const opts = {
      hostname: 'fcm.googleapis.com',
      port:     443,
      path:     '/fcm/send',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        Authorization:    `key=${serverKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', (e) => { console.warn('[Push] FCM error:', e.message); resolve(null); });
    req.write(body);
    req.end();
  });
}

/**
 * High-level helper: send a push notification to a user's stored push tokens.
 * Automatically routes Expo tokens to Expo Push API, FCM tokens to FCM.
 *
 * @param {Array<{token: string, platform: string}>} pushTokens - from User.pushTokens
 * @param {{ title: string, body: string, data?: object, imageUrl?: string }} payload
 */
async function sendPushToUser(pushTokens, payload) {
  if (!pushTokens || pushTokens.length === 0) return;

  const expoTokens = pushTokens
    .filter((t) => t.platform === 'expo' && t.token?.startsWith('ExponentPushToken'))
    .map((t) => t.token);

  const fcmTokens = pushTokens
    .filter((t) => t.platform === 'fcm')
    .map((t) => t.token);

  const results = await Promise.allSettled([
    expoTokens.length  ? sendViaExpo(expoTokens, payload) : Promise.resolve(),
    fcmTokens.length   ? sendViaFCM(fcmTokens, payload)   : Promise.resolve(),
  ]);

  // Log failures in dev
  if (process.env.NODE_ENV !== 'production') {
    for (const r of results) {
      if (r.status === 'rejected') console.warn('[Push] send error:', r.reason);
    }
  }
}

module.exports = { buildPushPayload, sendPushToUser, sendViaExpo, sendViaFCM };
