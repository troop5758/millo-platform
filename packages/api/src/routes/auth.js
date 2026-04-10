'use strict';
/**
 * Auth routes — register, login, logout, password reset, session management, OAuth.
 * Passwords hashed with bcrypt (cost 12). Sessions stored in DB with expiry.
 * Password reset tokens are single-use, 1-hour expiry, stored in PlatformSettings.
 * https://milloapp.com
 */
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('@millo/database');
const { sendCustomerEmail } = require('../lib/customerEmail');
const oauthProviders = require('../services/oauthProviders');
const {
  isProviderConfigured,
  requireProviderConfigured,
  getInternalProviderConfig,
  getOAuthClientId,
  getOAuthClientSecret,
} = oauthProviders;
const { AuthProviders } = require('../core/auth');
const authProviderRegistry = require('../services/authProviderRegistry');
const identityControl = require('../services/identityControl');
const magicLinkRedis = require('../lib/magicLinkRedis');
const { sendEmailVerification, verifyEmailToken } = require('../services/sendVerification');
const captchaService = require('../services/captchaService');
const loginRiskDecisionSvc = require('../services/loginRiskDecision.service');
const { deriveDeviceName, buildLocationString } = require('../lib/sessionRegistry');
const { writeAuditLog } = require('../services/auditLog');
const fraudService = require('../services/fraudService');
const { getCapabilities } = require('../config/capabilities');

const BCRYPT_ROUNDS  = 12;
const JWT_EXPIRES_IN = '30d';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RESET_TTL_MS   = 60 * 60 * 1000;            // 1 hour

function newToken() { return crypto.randomBytes(40).toString('hex'); }

/** Sign JWT for user when JWT_SECRET is set. */
function signJwt(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  return jwt.sign(
    { user_id: userId.toString(), sub: userId.toString() },
    secret,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Attach user from session token (called by middleware for protected routes). Returns user even when suspended/banned; middleware blocks with 403. */
async function resolveSession(token) {
  if (!token) return null;
  const session = await db.Session.findOne({ token, expiresAt: { $gt: new Date() }, revoked: { $ne: true } }).lean();
  if (!session) return null;
  const user = await db.User.findById(session.userId).lean();
  if (!user) return null;
  return { ...user, sessionId: session._id };
}

function getLoginRedirectUrl(query = '') {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const frontendUrl = process.env.FRONTEND_URL || appUrl.replace(/:\d+$/, ':5173');
  return `${frontendUrl}/login${query ? `?${query}` : ''}`;
}

function oauthRedirect(provider) {
  return (request, reply) => {
    try {
      // Enterprise auth contract: if client-id is missing, fail with a clear "login unavailable" posture.
      if (provider === 'google' && AuthProviders.google !== 'LIVE') {
        throw new Error('Google login unavailable');
      }
      requireProviderConfigured(provider);
      identityControl.assertOAuthProviderLive(provider);
    } catch (err) {
      request.log?.warn?.({ provider, error: err.code }, 'OAuth provider not configured or not LIVE');

      if (err.code === 'IDENTITY_OAUTH_NOT_LIVE') {
        if (process.env.NODE_ENV === 'production') {
          return reply.redirect(getLoginRedirectUrl(`oauth_error=${err.code}&provider=${provider}&status=${encodeURIComponent(err.status || '')}`), 302);
        }
        return reply.status(403).send({
          error: err.code,
          message: err.message,
          provider,
          status: err.status,
        });
      }

      // In production, redirect to login with error
      if (process.env.NODE_ENV === 'production') {
        return reply.redirect(getLoginRedirectUrl(`oauth_error=${err.code || 'provider_disabled'}&provider=${provider}`), 302);
      }

      // In development, return JSON error for debugging
      return reply.status(400).send({
        error: err.code || 'OAUTH_NOT_CONFIGURED',
        message: err.message,
        provider,
        missingEnvVars: err.missingEnvVars,
        hint: `Set the following environment variables: ${(err.missingEnvVars || []).join(', ')}`,
      });
    }

    const config = getInternalProviderConfig(provider);
    const clientId = getOAuthClientId(provider);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/auth/oauth/${provider}/callback`;

    const url = `${config.authUrl}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scope)}`;
    return reply.redirect(url, 302);
  };
}

/** Exchange OAuth code for an access token, fetch user profile, upsert user, return session. */
function sessionFieldsFromRequest(request, body = {}) {
  const deviceId = (body.deviceId && String(body.deviceId).slice(0, 256)) || (body.fingerprint && String(body.fingerprint).slice(0, 256)) || null;
  return {
    deviceId: deviceId || null,
    ip: (request && request.ip) ? String(request.ip).slice(0, 64) : null,
    userAgent: (request && request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null,
    lastSeen: new Date(),
  };
}

async function handleOAuthCallback(provider, code, reply, request = null) {
  const clientId     = getOAuthClientId(provider);
  const clientSecret = getOAuthClientSecret(provider);
  const appUrl       = process.env.APP_URL || 'http://localhost:3000';
  const redirectUri  = `${appUrl}/auth/oauth/${provider}/callback`;

  if (provider === 'google' && AuthProviders.google !== 'LIVE') {
    const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'http://localhost:3000').replace(/:\d+$/, ':5173');
    return reply.redirect(`${frontendUrl}/login?oauth_error=google_unavailable`, 302);
  }

  if (!isProviderConfigured(provider)) {
    const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'http://localhost:3000').replace(/:\d+$/, ':5173');
    return reply.redirect(`${frontendUrl}/login?oauth_error=provider_disabled`, 302);
  }

  try {
    identityControl.assertOAuthProviderLive(provider);
  } catch (e) {
    if (e.code === 'IDENTITY_OAUTH_NOT_LIVE') {
      return reply.status(403).send({
        error: e.code,
        message: e.message,
        provider: e.provider,
        status: e.status,
      });
    }
    throw e;
  }

  try {
    /* ── 1. Exchange code for tokens ── */
    const tokenUrl = provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://graph.facebook.com/v18.0/oauth/access_token';

    const tokenRes = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return reply.status(400).send({ error: 'OAUTH_TOKEN_EXCHANGE_FAILED', detail: tokenData });
    }

    /* ── 2. Fetch user profile ── */
    let email, oauthId, name, avatarUrl;
    if (provider === 'google') {
      const infoRes  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
      const info     = await infoRes.json();
      email     = info.email;
      oauthId   = info.sub;
      name      = info.name || info.given_name || 'User';
      avatarUrl = info.picture || null;
    } else {
      const fbRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${tokenData.access_token}`);
      const fb    = await fbRes.json();
      email     = fb.email;
      oauthId   = fb.id;
      name      = fb.name || 'User';
      avatarUrl = fb.picture?.data?.url || null;
    }

    if (!email) return reply.status(400).send({ error: 'OAUTH_NO_EMAIL', message: 'The account has no public email. Please use email/password login.' });

    /* ── 3. Upsert user ── */
    let user = await db.User.findOne({ email: email.toLowerCase() }).lean();
    if (!user) {
      user = await db.User.create({ email: email.toLowerCase(), emailVerified: true, flags: { emailVerified: true, oauthProvider: provider, oauthId } });
      const username = email.split('@')[0].replace(/[^a-z0-9_]/gi, '').slice(0, 20) + Math.floor(Math.random() * 900 + 100);
      // Profile and wallet must both succeed — failure leaves a broken account
      await db.Profile.create({ userId: user._id, displayName: name, avatarUrl, meta: { username } })
        .catch((err) => {
          request.log.error({ err, userId: String(user._id), provider }, 'CRITICAL: OAuth Profile.create failed after User.create');
          throw err;
        });
      await db.Wallet.create({ userId: user._id, balanceCents: 0 })
        .catch((err) => {
          request.log.error({ err, userId: String(user._id), provider }, 'CRITICAL: OAuth Wallet.create failed after User.create — user has no wallet');
          throw err;
        });
    } else {
      // Update avatar if missing
      await db.Profile.updateOne({ userId: user._id }, { $setOnInsert: { displayName: name, avatarUrl } }, { upsert: true });
    }

    /* ── 4. ATO: record login and detect impossible travel ── */
    const geoService = require('../services/geoService');
    const accountTakeoverService = require('../services/accountTakeoverService');
    const geo = request ? await geoService.lookupAsync(request.ip).catch(() => null) : null;
    const device = sessionFieldsFromRequest(request);
    const newLogin = {
      ip: request?.ip || null,
      country: geo?.country || null,
      city: geo?.city || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      deviceFingerprint: device?.deviceId || null,
      userAgent: device?.userAgent || null,
    };
    if (request) await accountTakeoverService.recordLoginAndCheckATO(user._id, newLogin, { log: request.log }).catch(() => {});

    if (request) {
      const kafkaOAuth = require('../services/kafkaEventBus');
      kafkaOAuth.publish(kafkaOAuth.TOPICS.AUTH_EVENTS, {
        event: 'login.success',
        userId: String(user._id),
        ip: request.ip,
        ...newLogin,
      }).catch(() => {});
    }

    if (request && device?.deviceId) {
      const deviceRiskEnforcement = require('../services/deviceRiskEnforcement');
      const riskOutcome = await deviceRiskEnforcement.maybeRestrictUserForDeviceRisk(user, device.deviceId, 'oauth_login');
      if (riskOutcome.restricted) {
        const frontendUrlFail = process.env.FRONTEND_URL || appUrl.replace(/:\d+$/, ':5173');
        return reply.redirect(`${frontendUrlFail}/login?oauth_error=device_risk`, 302);
      }
    }

    /* ── 5. Create session (with device fingerprint when request available) ── */
    const token     = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const oauthSession = await db.Session.create({ userId: user._id, token, expiresAt, ...device });
    fraudService.notifySiftLogin(user._id, {
      ip: request?.ip,
      userAgent: device?.userAgent,
      sessionId: String(oauthSession._id),
      deviceFingerprint: device?.deviceId,
      optOutFingerprinting: !!user.optOutFingerprinting,
      $user_email: user.email,
    }).catch(() => {});

    /* ── 6. Redirect to frontend with token ── */
    const frontendUrl = process.env.FRONTEND_URL || appUrl.replace(/:\d+$/, ':5173');
    return reply.redirect(`${frontendUrl}/oauth-callback?token=${token}&provider=${provider}`, 302);
  } catch (err) {
    return reply.status(500).send({ error: 'OAUTH_ERROR', message: err.message });
  }
}

/** Decode a JWT payload without signature verification (used only for non-security-sensitive fields). */
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch { return null; }
}

/** Decode a JWT header without signature verification. */
function decodeJwtHeader(token) {
  try {
    const base64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch { return null; }
}

// In-memory JWK cache: { keys: [...], fetchedAt: number }
let _appleJwkCache = null;
const APPLE_JWK_TTL_MS = 60 * 60 * 1000; // refresh Apple public keys every hour

/**
 * Verify an Apple id_token JWT signature using Apple's public JWKS endpoint.
 * Returns the decoded payload on success, throws on failure.
 * Uses Node.js 20+ crypto.subtle — no extra npm dependency needed.
 * https://developer.apple.com/documentation/sign_in_with_apple/fetch_apple_s_public_key_for_verifying_token_signature
 */
async function verifyAppleJwt(idToken) {
  const header  = decodeJwtHeader(idToken);
  const payload = decodeJwtPayload(idToken);
  if (!header || !payload) throw new Error('APPLE_JWT_MALFORMED');

  // 1. Fetch Apple's public keys (cached)
  const now = Date.now();
  if (!_appleJwkCache || now - _appleJwkCache.fetchedAt > APPLE_JWK_TTL_MS) {
    const res  = await fetch('https://appleid.apple.com/auth/keys');
    if (!res.ok) throw new Error('APPLE_JWKS_FETCH_FAILED');
    const data = await res.json();
    _appleJwkCache = { keys: data.keys, fetchedAt: now };
  }

  // 2. Find the JWK matching the token's key ID
  const jwk = _appleJwkCache.keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`APPLE_JWT_KEY_NOT_FOUND: kid=${header.kid}`);

  // 3. Import the public key
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  // 4. Verify the signature
  const [headerB64, payloadB64, sigB64] = idToken.split('.');
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
  const signature    = Buffer.from(sigB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    publicKey,
    signature,
    signingInput
  );
  if (!valid) throw new Error('APPLE_JWT_SIGNATURE_INVALID');

  // 5. Validate standard claims
  const clientId = process.env.OAUTH_APPLE_CLIENT_ID;
  if (clientId && payload.aud !== clientId) throw new Error(`APPLE_JWT_AUD_MISMATCH: expected ${clientId}, got ${payload.aud}`);
  if (payload.iss !== 'https://appleid.apple.com') throw new Error(`APPLE_JWT_ISS_INVALID: ${payload.iss}`);
  if (payload.exp && payload.exp < Math.floor(now / 1000)) throw new Error('APPLE_JWT_EXPIRED');

  return payload;
}

async function handleAppleCallback(request, reply) {
  try {
    identityControl.assertOAuthProviderLive('apple');
  } catch (e) {
    if (e.code === 'IDENTITY_OAUTH_NOT_LIVE') {
      const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'http://localhost:3000').replace(/:\d+$/, ':5173');
      return reply.redirect(`${frontendUrl}/login?oauth_error=${e.code}&provider=apple&status=${encodeURIComponent(e.status || '')}`, 302);
    }
    throw e;
  }

  try {
  const clientId     = process.env.OAUTH_APPLE_CLIENT_ID;
  const clientSecret = process.env.OAUTH_APPLE_CLIENT_SECRET; // JWT signed with Apple private key
  const appUrl       = process.env.APP_URL || 'http://localhost:3000';
  const redirectUri  = `${appUrl}/auth/oauth/apple/callback`;

  if (!clientId) {
    const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'http://localhost:3000').replace(/:\d+$/, ':5173');
    return reply.redirect(`${frontendUrl}/login?oauth_error=provider_disabled`, 302);
  }

  const code    = request.body?.code;
  const idToken = request.body?.id_token;
  // Apple sends user name only on first auth
  let appleUser;
  try { appleUser = request.body?.user ? JSON.parse(request.body.user) : null; } catch { appleUser = null; }

  if (!code && !idToken) return reply.status(400).send({ error: 'MISSING_CODE_OR_ID_TOKEN' });

  let email, oauthId, name;

  // Verify the id_token signature against Apple's public keys, then read claims
  if (idToken) {
    let payload;
    try {
      payload = await verifyAppleJwt(idToken);
    } catch (verifyErr) {
      request.log.warn({ err: verifyErr }, 'Apple id_token verification failed');
      return reply.status(400).send({ error: 'INVALID_ID_TOKEN', detail: verifyErr.message });
    }
    email   = payload.email;
    oauthId = payload.sub;
    name    = appleUser?.name ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim() : null;
  }

  // Exchange code for tokens if we need email (Apple hides email in id_token after first auth)
  if (!email && clientSecret) {
    try {
      const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.id_token) {
        // Token came directly from Apple's token endpoint over TLS — verify for defence-in-depth
        try {
          const payload = await verifyAppleJwt(tokenData.id_token);
          email   = email   || payload?.email;
          oauthId = oauthId || payload?.sub;
        } catch {
          // Fall back to unsigned decode — the token arrived over TLS so trust it
          const payload = decodeJwtPayload(tokenData.id_token);
          email   = email   || payload?.email;
          oauthId = oauthId || payload?.sub;
        }
      }
    } catch (err) {
      request.log.warn({ err }, 'Apple token exchange failed — continuing without refreshed email');
    }
  }

  if (!email && !oauthId) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return reply.redirect(`${frontendUrl}/login?oauth_error=apple_no_email`, 302);
  }

  // Find or create user
  let user = oauthId
    ? await db.User.findOne({ 'flags.oauthId': oauthId }).lean()
    : null;
  if (!user && email) {
    user = await db.User.findOne({ email: email.toLowerCase() }).lean();
  }
  if (!user) {
    const safeEmail = email || `apple_${oauthId}@privaterelay.appleid.com`;
    user = await db.User.create({
      email: safeEmail.toLowerCase(),
      emailVerified: true,
      flags: { emailVerified: true, oauthProvider: 'apple', oauthId },
    });
    const displayName = name || safeEmail.split('@')[0];
    const username    = displayName.replace(/[^a-z0-9_]/gi, '').slice(0, 20) + Math.floor(Math.random() * 900 + 100);
    // Profile and wallet must both succeed — failure leaves a broken account
    await db.Profile.create({ userId: user._id, displayName, meta: { username } })
      .catch((err) => {
        request.log.error({ err, userId: String(user._id) }, 'CRITICAL: Apple OAuth Profile.create failed after User.create');
        throw err;
      });
    await db.Wallet.create({ userId: user._id, balanceCents: 0 })
      .catch((err) => {
        request.log.error({ err, userId: String(user._id) }, 'CRITICAL: Apple OAuth Wallet.create failed after User.create — user has no wallet');
        throw err;
      });
  }

  // ATO: record login and detect impossible travel (risk lock)
  const geoService = require('../services/geoService');
  const accountTakeoverService = require('../services/accountTakeoverService');
  const geo = await geoService.lookupAsync(request.ip).catch(() => null);
  const device = sessionFieldsFromRequest(request);
  const newLogin = {
    ip: request.ip || null,
    country: geo?.country || null,
    city: geo?.city || null,
    latitude: geo?.latitude ?? null,
    longitude: geo?.longitude ?? null,
    deviceFingerprint: device?.deviceId || null,
    userAgent: device?.userAgent || null,
  };
  await accountTakeoverService.recordLoginAndCheckATO(user._id, newLogin, { log: request.log }).catch(() => {});

  const kafkaAuth = require('../services/kafkaEventBus');
  kafkaAuth.publish(kafkaAuth.TOPICS.AUTH_EVENTS, {
    event: 'login.success',
    userId: String(user._id),
    ip: request.ip,
    ...newLogin,
  }).catch(() => {});

  // Create session (with device fingerprint)
  const token     = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const appleSession = await db.Session.create({ userId: user._id, token, expiresAt, ...device });
  fraudService.notifySiftLogin(user._id, {
    ip: request.ip,
    userAgent: device?.userAgent,
    sessionId: String(appleSession._id),
    deviceFingerprint: device?.deviceId,
    optOutFingerprinting: !!user.optOutFingerprinting,
    $user_email: user.email,
  }).catch(() => {});

  const frontendUrl = process.env.FRONTEND_URL || appUrl.replace(/:\d+$/, ':5173');
  return reply.redirect(`${frontendUrl}/oauth-callback?token=${token}&provider=apple`, 302);
  } catch (err) {
    request.log.error({ err }, 'Apple OAuth callback error');
    const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'http://localhost:3000').replace(/:\d+$/, ':5173');
    return reply.redirect(`${frontendUrl}/login?oauth_error=apple_error`, 302);
  }
}

function oauthCallback(provider) {
  return async (request, reply) => {
    const code = request.query?.code;
    if (!code) return reply.status(400).send({ error: 'MISSING_CODE' });
    return handleOAuthCallback(provider, code, reply, request);
  };
}

// Per-route rate-limit configs for auth endpoints
const AUTH_RATE_LIMIT = {
  max: 10,         // 10 attempts
  timeWindow: '15 minutes',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again in 15 minutes.' }),
};
const REGISTER_RATE_LIMIT = {
  max: 5,          // 5 registrations per IP per hour
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many accounts created. Please try again later.' }),
};
const RESET_RATE_LIMIT = {
  max: 3,          // 3 password reset requests per hour
  timeWindow: '1 hour',
  errorResponseBuilder: () => ({ error: 'TOO_MANY_REQUESTS', message: 'Too many reset requests. Please try again later.' }),
};

/** Shape returned to clients on register/login/me (lean User + Profile + optional flags). */
function authUserResponse(user, profile, extras = {}) {
  if (!user) return null;
  const flags = user.flags || {};
  const emailVerified =
    extras.emailVerified != null
      ? !!extras.emailVerified
      : !!(user.emailVerified || flags.emailVerified);
  const riskLock = extras.riskLock != null ? !!extras.riskLock : !!user.riskLock;
  const displayName = profile?.displayName ?? profile?.meta?.username ?? null;
  const username = profile?.meta?.username ?? null;
  return {
    id: String(user._id),
    email: user.email,
    emailVerified,
    role: user.role || 'user',
    status: user.status || 'active',
    riskLock,
    optOutFingerprinting: !!user.optOutFingerprinting,
    ...(displayName && { displayName }),
    ...(username && { username }),
    ...(profile?.avatarUrl && { avatarUrl: profile.avatarUrl }),
  };
}

async function authRoutes(app) {

  /* ── Register ── */
  app.post('/auth/register', { config: { rateLimit: REGISTER_RATE_LIMIT } }, async (request, reply) => {
    const { email, password, displayName, username, utmSource, utmMedium, utmCampaign, affiliateCode, deviceType, role } = request.body ?? {};

    if (role === 'support' || role === 'admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'Support and admin accounts can only be created by administrators.',
      });
    }
    if (!email || !password) return reply.status(400).send({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });
    if (password.length < 8) return reply.status(400).send({ error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.status(400).send({ error: 'INVALID_EMAIL' });

    const existing = await db.User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (existing) return reply.status(409).send({ error: 'EMAIL_TAKEN', message: 'An account with that email already exists.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await db.User.create({
      email: email.toLowerCase().trim(),
      emailVerified: false,
      flags: { passwordHash: hash, emailVerified: false },
    });

    // Create profile
    await db.Profile.create({
      userId: user._id,
      displayName: displayName || (username ? username : email.split('@')[0]),
      meta:        { username: username || email.split('@')[0] },
    });

    // Create wallet — failure must not be silent; a missing wallet breaks all payments
    await db.Wallet.create({ userId: user._id, balanceCents: 0 })
      .catch((err) => {
        request.log.error({ err, userId: String(user._id) }, 'CRITICAL: failed to create wallet during registration');
        throw err;
      });

    // Create session
    const token     = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const deviceId  = (request.body && request.body.deviceId) ? String(request.body.deviceId).slice(0, 256) : (request.body && request.body.fingerprint) ? String(request.body.fingerprint).slice(0, 256) : null;
    const meta      = (deviceType && ['ios', 'android', 'web'].includes(String(deviceType).toLowerCase())) ? { deviceType: String(deviceType).toLowerCase() } : {};
    const registerSession = await db.Session.create({
      userId: user._id,
      token,
      expiresAt,
      deviceId: deviceId || null,
      ip: request.ip || null,
      userAgent: (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null,
      lastSeen: new Date(),
      meta,
    });
    fraudService.notifySiftLogin(user._id, {
      ip: request.ip,
      userAgent: (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null,
      sessionId: String(registerSession._id),
      deviceFingerprint: deviceId,
      optOutFingerprinting: !!user.optOutFingerprinting,
      $user_email: user.email,
    }).catch(() => {});

    // Email verification — token + welcome email
    sendEmailVerification(user, {
      displayName: displayName || (username ? username : email.split('@')[0]),
      title: 'Welcome to Millo — verify your email',
      body: `Hi ${displayName || 'there'}, please verify your email to unlock all features.`,
    }).catch((err) => request.log.warn({ err, userId: String(user._id) }, 'Failed to send welcome/verify email'));

    // Phase 13: Record marketing attribution (non-blocking)
    if (utmSource || utmCampaign || affiliateCode) {
      const marketingCampaignService = require('../services/marketingCampaignService');
      marketingCampaignService.recordAttribution(user._id, {
        utmSource, utmMedium, utmCampaign, affiliateCode,
        meta: { ip: request.ip, userAgent: request.headers['user-agent'] },
      }).catch((err) => request.log.warn({ err, userId: String(user._id) }, 'Attribution record failed'));
    }

    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    const jwtToken = signJwt(user._id);
    return reply.status(201).send({
      ok: true,
      token,
      ...(jwtToken && { jwt: jwtToken }),
      user: authUserResponse(user, profile, { emailVerified: false }),
    });
  });

  /* ── Login ── */
  app.post('/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const { email, password, deviceType } = request.body ?? {};
    if (!email || !password) return reply.status(400).send({ error: 'EMAIL_AND_PASSWORD_REQUIRED' });

    const user = await db.User.findOne({ email: email.toLowerCase().trim() }).lean();
    if (!user) return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });

    const hash = user.flags?.passwordHash;
    if (!hash) return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });

    const ok = await bcrypt.compare(password, hash);
    if (!ok) {
      try {
        const userSecurityService = require('../services/userSecurity.service');
        await userSecurityService.incrementFailed(user._id);
      } catch (_) {}
      return reply.status(401).send({ error: 'INVALID_CREDENTIALS' });
    }

    // Block suspended/banned/restricted at login — they cannot obtain a new session
    const status = user.status || 'active';
    if (status === 'suspended') return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
    if (status === 'banned') return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been permanently suspended.' });
    if (status === 'restricted') {
      return reply.status(403).send({
        error: 'ACCOUNT_RESTRICTED',
        message: 'Your account is restricted due to risk signals. Contact support.',
      });
    }
    if (user.flags?.suspended === true) return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
    const moderationService = require('../services/moderationService');
    const modStatus = await moderationService.getUserModerationStatus(user._id);
    if (modStatus.isBanned) return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been suspended for violations.' });
    if (modStatus.isSuspended) return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account is temporarily suspended.', suspendedUntil: modStatus.suspendedUntil });

    const deviceIdForRisk =
      (request.body && request.body.deviceId && String(request.body.deviceId).slice(0, 256))
      || (request.body && request.body.fingerprint && String(request.body.fingerprint).slice(0, 256))
      || null;

    let deviceRiskValue = 0;
    if (deviceIdForRisk) {
      const deviceRiskEnforcement = require('../services/deviceRiskEnforcement');
      const riskOutcome = await deviceRiskEnforcement.maybeRestrictUserForDeviceRisk(user, deviceIdForRisk, 'login');
      deviceRiskValue = riskOutcome.risk;
      if (riskOutcome.restricted) {
        return reply.status(403).send({
          error: 'DEVICE_RISK_BLOCKED',
          message: 'Suspicious device activity',
          loginDecision: loginRiskDecisionSvc.DECISION.BLOCK,
          deviceRisk: deviceRiskValue,
        });
      }
    }

    /** Set true after Turnstile (or other CAPTCHA) verifies once — tokens are often single-use. */
    let captchaAlreadyVerified = false;

    const userSecurityService = require('../services/userSecurity.service');
    const loginRbaService = require('../services/loginRba.service');
    const sec = await userSecurityService.ensureUserSecurity(user._id);
    if (sec.lockedUntil && sec.lockedUntil > new Date()) {
      return reply.status(403).send({
        error: 'ACCOUNT_LOCKED',
        message: 'Account temporarily locked. Try again later.',
      });
    }

    const behaviorPayload = (request.body && request.body.behavior) || null;
    const rbaSnapshot = await loginRbaService.computeRba({
      user,
      request,
      sec,
      deviceId: deviceIdForRisk,
      behaviorPayload,
    });
    loginRbaService.trustGraphLoginAttempt(user._id, deviceIdForRisk, request.headers['user-agent'], rbaSnapshot.risk);

    const uaRba = (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null;

    if (rbaSnapshot.decision === 'BLOCK') {
      sec.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      await sec.save();
      await loginRbaService.recordLoginEvent({
        userId: user._id,
        deviceId: deviceIdForRisk,
        ip: request.ip,
        country: rbaSnapshot.country,
        userAgent: uaRba,
        success: false,
        riskScore: rbaSnapshot.risk,
        decision: 'BLOCK',
      });
      return reply.status(403).send({
        error: 'LOGIN_RISK_BLOCKED',
        message: 'High-risk login blocked.',
        loginRba: { riskScore: rbaSnapshot.risk, decision: 'BLOCK' },
      });
    }

    if (rbaSnapshot.decision === 'CAPTCHA') {
      if (!captchaService.isEnabled()) {
        await loginRbaService.recordLoginEvent({
          userId: user._id,
          deviceId: deviceIdForRisk,
          ip: request.ip,
          country: rbaSnapshot.country,
          userAgent: uaRba,
          success: false,
          riskScore: rbaSnapshot.risk,
          decision: 'CAPTCHA',
        });
        const otpService = require('../services/otp.service');
        const otpId = await otpService.issueOtp(user._id, {
          deviceId: deviceIdForRisk,
          deviceType: request.body?.deviceType,
          email: user.email,
        });
        return reply.send({
          ok: false,
          stepUp: true,
          otpId,
          loginRba: { riskScore: rbaSnapshot.risk, decision: 'CAPTCHA' },
          captchaUnavailable: true,
        });
      }
      const captchaTokRba = request.body.captchaToken || request.headers['x-captcha-token'];
      if (!captchaTokRba) {
        await loginRbaService.recordLoginEvent({
          userId: user._id,
          deviceId: deviceIdForRisk,
          ip: request.ip,
          country: rbaSnapshot.country,
          userAgent: uaRba,
          success: false,
          riskScore: rbaSnapshot.risk,
          decision: 'CAPTCHA',
        });
        return reply.status(403).send({
          error: 'CAPTCHA_REQUIRED',
          requireCaptcha: true,
          loginRba: { riskScore: rbaSnapshot.risk, decision: 'CAPTCHA' },
          siteKey: captchaService.getSiteKey(),
          provider: captchaService.getProvider(),
        });
      }
      const verifyRba = await captchaService.verifyToken(captchaTokRba, request.ip);
      if (!verifyRba.success) {
        return reply.status(400).send({
          error: 'CAPTCHA_INVALID',
          message: verifyRba.error,
          loginRba: { riskScore: rbaSnapshot.risk, decision: 'CAPTCHA' },
        });
      }
      captchaAlreadyVerified = true;
    }

    if (rbaSnapshot.decision === 'STEP_UP') {
      const otpService = require('../services/otp.service');
      await loginRbaService.recordLoginEvent({
        userId: user._id,
        deviceId: deviceIdForRisk,
        ip: request.ip,
        country: rbaSnapshot.country,
        userAgent: uaRba,
        success: false,
        riskScore: rbaSnapshot.risk,
        decision: 'STEP_UP',
      });
      const otpId = await otpService.issueOtp(user._id, {
        deviceId: deviceIdForRisk,
        deviceType: request.body?.deviceType,
        email: user.email,
      });
      return reply.send({
        ok: false,
        stepUp: true,
        otpId,
        loginRba: { riskScore: rbaSnapshot.risk, decision: 'STEP_UP' },
      });
    }

    const { DECISION } = loginRiskDecisionSvc;
    const riskEval = await loginRiskDecisionSvc.evaluateLoginRisk({
      user,
      deviceId: deviceIdForRisk,
      deviceRisk: deviceRiskValue,
    });

    if (riskEval.decision === DECISION.BLOCK) {
      return reply.status(403).send({
        error: 'LOGIN_RISK_BLOCKED',
        message: 'Login blocked due to risk signals.',
        loginDecision: DECISION.BLOCK,
        loginRisk: {
          riskScore: riskEval.riskScore,
          deviceRisk: riskEval.deviceRisk,
          combinedScore: riskEval.combinedScore,
          signals: riskEval.signals,
        },
      });
    }

    if (riskEval.decision === DECISION.CAPTCHA && captchaService.isEnabled()) {
      if (!captchaAlreadyVerified) {
        const captchaToken = request.body.captchaToken || request.headers['x-captcha-token'];
        if (!captchaToken) {
          return reply.status(403).send({
            error: 'CAPTCHA_REQUIRED',
            requireCaptcha: true,
            loginDecision: DECISION.CAPTCHA,
            siteKey: captchaService.getSiteKey(),
            provider: captchaService.getProvider(),
            loginRisk: {
              riskScore: riskEval.riskScore,
              deviceRisk: riskEval.deviceRisk,
              combinedScore: riskEval.combinedScore,
              signals: riskEval.signals,
            },
          });
        }
        const verify = await captchaService.verifyToken(captchaToken, request.ip);
        if (!verify.success) {
          return reply.status(400).send({
            error: 'CAPTCHA_INVALID',
            message: verify.error,
            loginDecision: DECISION.CAPTCHA,
          });
        }
      }
    }

    // ATO: record login and detect impossible travel (risk lock)
    const accountTakeoverService = require('../services/accountTakeoverService');
    const geoService = require('../services/geoService');
    const geo = await geoService.lookupAsync(request.ip).catch(() => null);
    const deviceId  = (request.body && request.body.deviceId) ? String(request.body.deviceId).slice(0, 256) : (request.body && request.body.fingerprint) ? String(request.body.fingerprint).slice(0, 256) : null;
    const newLogin = {
      ip: request.ip || null,
      country: geo?.country || null,
      city: geo?.city || null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      deviceFingerprint: deviceId || null,
      userAgent: (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null,
    };
    const atoResult = await accountTakeoverService.recordLoginAndCheckATO(user._id, newLogin, { log: request.log }).catch(() => ({ recorded: false, riskLockSet: false }));

    const kafka = require('../services/kafkaEventBus');
    kafka.publish(kafka.TOPICS.AUTH_EVENTS, {
      event: 'login.success',
      userId: String(user._id),
      ip: request.ip,
      ...newLogin,
    }).catch(() => {});

    // Invalidate old sessions older than 90 days (cleanup)
    await db.Session.deleteMany({ userId: user._id, expiresAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }).catch(() => {});

    const token     = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const meta      = (deviceType && ['ios', 'android', 'web'].includes(String(deviceType).toLowerCase())) ? { deviceType: String(deviceType).toLowerCase() } : {};
    const userAgent = (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null;
    const deviceName = deriveDeviceName(userAgent, deviceType);
    const location   = buildLocationString(geo);
    const now        = new Date();
    const loginSession = await db.Session.create({
      userId: user._id,
      token,
      expiresAt,
      deviceId,
      deviceName: deviceName || undefined,
      ip: request.ip || null,
      ipAddress: request.ip || null,
      userAgent: userAgent || null,
      location: location || undefined,
      lastSeen: now,
      lastActiveAt: now,
      meta,
    });
    fraudService.notifySiftLogin(user._id, {
      ip: request.ip,
      userAgent,
      sessionId: String(loginSession._id),
      deviceFingerprint: deviceId,
      optOutFingerprinting: !!user.optOutFingerprinting,
      $user_email: user.email,
    }).catch(() => {});

    // Enqueue risk score update for automated enforcement pipeline (fire-and-forget)
    try {
      const { addBotDetectionJob } = require('../lib/botDetectionQueue');
      addBotDetectionJob('risk_score_update', { userId: String(user._id) }).catch(() => {});
    } catch (_) {}

    // Login alert: new device or new location (LOGIN_ALERT_EMAIL_ENABLED=true)
    const loginAlertService = require('../services/loginAlertService');
    loginAlertService.maybeSendLoginAlert(user, {
      deviceId,
      country: geo?.country || null,
      deviceName,
      location,
      ip: request.ip || null,
    }).catch(() => {});

    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    const userAfter = await db.User.findById(user._id).select('riskLock').lean();
    const riskLock = userAfter?.riskLock ?? atoResult.riskLockSet ?? false;
    let loginDecision = riskEval.decision;
    if (riskLock || atoResult.riskLockSet) {
      loginDecision = DECISION.STEP_UP;
    }

    try {
      await userSecurityService.applySuccessfulLoginProfile(sec, {
        deviceId,
        ip: request.ip,
        country: rbaSnapshot.country || geo?.country || null,
      });
      const behaviorProfile = require('../services/behaviorProfile.service');
      const bl = await behaviorProfile.getBehaviorBaselineProfile(user._id).catch(() => null);
      if (bl) await db.UserSecurity.updateOne({ userId: user._id }, { $set: { baselineBehavior: bl } }).catch(() => {});
    } catch (_) {}

    await loginRbaService.recordLoginEvent({
      userId: user._id,
      deviceId,
      ip: request.ip,
      country: rbaSnapshot.country || geo?.country || null,
      userAgent,
      success: true,
      riskScore: rbaSnapshot.risk,
      decision: 'ALLOW',
    }).catch(() => {});

    writeAuditLog({
      action: 'LOGIN_SESSION_ISSUED',
      userId: user._id,
      meta: {
        loginDecision,
        priorDecision: riskEval.decision,
        riskScore: riskEval.riskScore,
        deviceRisk: riskEval.deviceRisk,
        combinedScore: riskEval.combinedScore,
        signals: riskEval.signals,
        loginRbaScore: rbaSnapshot.risk,
        riskLock,
        sessionId: String(loginSession._id),
        ip: request.ip || null,
      },
    }).catch((err) => request.log.warn({ err, userId: String(user._id) }, 'LOGIN_SESSION_ISSUED audit failed'));

    const jwtToken = signJwt(user._id);
    return reply.send({
      ok: true,
      token,
      ...(jwtToken && { jwt: jwtToken }),
      loginDecision,
      loginRisk: {
        riskScore: riskEval.riskScore,
        deviceRisk: riskEval.deviceRisk,
        combinedScore: riskEval.combinedScore,
        signals: riskEval.signals,
      },
      loginRba: { riskScore: rbaSnapshot.risk, decision: rbaSnapshot.decision },
      ...(riskLock && { requireVerification: true }),
      user: authUserResponse(user, profile, { riskLock }),
    });
  });

  /* ── Step-up OTP: complete session after /auth/login returned stepUp + otpId ── */
  app.post('/auth/verify-otp', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const { otpId, code, deviceType } = request.body ?? {};
    if (!otpId || code == null) return reply.status(400).send({ error: 'OTP_ID_AND_CODE_REQUIRED' });

    const otpService = require('../services/otp.service');
    const userSecuritySvc = require('../services/userSecurity.service');
    const loginRbaSvc = require('../services/loginRba.service');

    const v = await otpService.verifyOtp(otpId, code);
    if (!v.ok) return reply.status(401).send({ error: 'OTP_INVALID', message: 'Invalid or expired code.' });

    const user = await db.User.findById(v.userId).lean();
    if (!user) return reply.status(401).send({ error: 'USER_NOT_FOUND' });

    const statusOtp = user.status || 'active';
    if (statusOtp === 'suspended') return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
    if (statusOtp === 'banned') return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been permanently suspended.' });
    if (statusOtp === 'restricted') {
      return reply.status(403).send({
        error: 'ACCOUNT_RESTRICTED',
        message: 'Your account is restricted due to risk signals. Contact support.',
      });
    }
    if (user.flags?.suspended === true) return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
    const moderationSvc = require('../services/moderationService');
    const modSt = await moderationSvc.getUserModerationStatus(user._id);
    if (modSt.isBanned) return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been suspended for violations.' });
    if (modSt.isSuspended) {
      return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account is temporarily suspended.', suspendedUntil: modSt.suspendedUntil });
    }

    const deviceId =
      (v.deviceId && String(v.deviceId).slice(0, 256))
      || (request.body?.deviceId && String(request.body.deviceId).slice(0, 256))
      || (request.body?.fingerprint && String(request.body.fingerprint).slice(0, 256))
      || null;

    const accountTakeoverSvc = require('../services/accountTakeoverService');
    const geoSvc = require('../services/geoService');
    const geoOtp = await geoSvc.lookupAsync(request.ip).catch(() => null);
    const uaOtp = (request.headers && request.headers['user-agent']) ? String(request.headers['user-agent']).slice(0, 512) : null;
    const newLoginOtp = {
      ip: request.ip || null,
      country: geoOtp?.country || null,
      city: geoOtp?.city || null,
      latitude: geoOtp?.latitude ?? null,
      longitude: geoOtp?.longitude ?? null,
      deviceFingerprint: deviceId || null,
      userAgent: uaOtp || null,
    };
    await accountTakeoverSvc.recordLoginAndCheckATO(user._id, newLoginOtp, { log: request.log }).catch(() => {});

    const kafkaOtp = require('../services/kafkaEventBus');
    kafkaOtp.publish(kafkaOtp.TOPICS.AUTH_EVENTS, {
      event: 'login.success',
      userId: String(user._id),
      ip: request.ip,
      ...newLoginOtp,
    }).catch(() => {});

    await db.Session.deleteMany({ userId: user._id, expiresAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }).catch(() => {});

    const tokenOtp = newToken();
    const expiresAtOtp = new Date(Date.now() + SESSION_TTL_MS);
    const metaOtp = (deviceType && ['ios', 'android', 'web'].includes(String(deviceType).toLowerCase()))
      ? { deviceType: String(deviceType).toLowerCase() }
      : {};
    const deviceNameOtp = deriveDeviceName(uaOtp, deviceType);
    const locationOtp = buildLocationString(geoOtp);
    const nowOtp = new Date();
    const loginSessionOtp = await db.Session.create({
      userId: user._id,
      token: tokenOtp,
      expiresAt: expiresAtOtp,
      deviceId,
      deviceName: deviceNameOtp || undefined,
      ip: request.ip || null,
      ipAddress: request.ip || null,
      userAgent: uaOtp || null,
      location: locationOtp || undefined,
      lastSeen: nowOtp,
      lastActiveAt: nowOtp,
      meta: metaOtp,
    });

    fraudService.notifySiftLogin(user._id, {
      ip: request.ip,
      userAgent: uaOtp,
      sessionId: String(loginSessionOtp._id),
      deviceFingerprint: deviceId,
      optOutFingerprinting: !!user.optOutFingerprinting,
      $user_email: user.email,
    }).catch(() => {});

    const secOtp = await userSecuritySvc.ensureUserSecurity(user._id);
    await userSecuritySvc.applySuccessfulLoginProfile(secOtp, {
      deviceId,
      ip: request.ip,
      country: geoOtp?.country || null,
    }).catch(() => {});

    const { getGeo } = require('../services/ip.service');
    await loginRbaSvc.recordLoginEvent({
      userId: user._id,
      deviceId,
      ip: request.ip,
      country: geoOtp?.country || getGeo(request.ip || ''),
      userAgent: uaOtp,
      success: true,
      riskScore: 0,
      decision: 'STEP_UP',
    }).catch(() => {});

    writeAuditLog({
      action: 'LOGIN_SESSION_ISSUED',
      userId: user._id,
      meta: {
        via: 'otp_step_up',
        sessionId: String(loginSessionOtp._id),
        ip: request.ip || null,
      },
    }).catch((err) => request.log.warn({ err, userId: String(user._id) }, 'LOGIN_SESSION_ISSUED audit failed'));

    const profileOtp = await db.Profile.findOne({ userId: user._id }).lean();
    const userAfterOtp = await db.User.findById(user._id).select('riskLock').lean();
    const jwtOtp = signJwt(user._id);
    return reply.send({
      ok: true,
      token: tokenOtp,
      ...(jwtOtp && { jwt: jwtOtp }),
      loginDecision: loginRiskDecisionSvc.DECISION.ALLOW,
      user: authUserResponse(user, profileOtp, { riskLock: userAfterOtp?.riskLock ?? false }),
    });
  });

  /* ── CAPTCHA config (client can pre-load widget) ── */
  app.get('/auth/captcha/config', async (request, reply) => {
    return reply.send({
      enabled: captchaService.isEnabled(),
      siteKey: captchaService.getSiteKey(),
      provider: captchaService.getProvider(),
    });
  });

  /* ── OAuth provider contract (public) — LIVE | DISABLED per provider; clients disable buttons unless LIVE ── */
  app.get('/api/auth/providers', async (_request, reply) => {
    return reply.send(identityControl.getPublicIdentityRegistry());
  });

  /* ── Auth providers (OAuth + magic-link fallback) ── */
  app.get('/auth/providers', async (_request, reply) => {
    const response = authProviderRegistry.getProvidersResponse();
    return reply.send(response);
  });

  /* ── Auth providers status (for admin/debugging) ── */
  app.get('/auth/providers/status', async (request, reply) => {
    // Only allow in development or for admins
    const user = request.user;
    const isAdmin = user?.roles?.includes('admin') || user?.flags?.isAdmin;
    const isDev = process.env.NODE_ENV !== 'production';

    if (!isDev && !isAdmin) {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }

    const summary = authProviderRegistry.getAuthConfigSummary();
    const validation = oauthProviders.validateOAuthConfig({ log: request.log });

    return reply.send({
      ...summary,
      validation: {
        valid: validation.valid,
        warnings: validation.warnings,
        errors: validation.errors,
      },
    });
  });

  /* ── Magic link: request login link ── */
  app.post('/auth/magic-link', async (request, reply) => {
    const ml = identityControl.getMagicLinkContractStatus();
    if (ml === 'DISABLED') {
      return reply.status(503).send({
        error: 'IDENTITY_MAGIC_LINK_DISABLED',
        message: 'Email link sign-in is not available (email capability is off). Use password or an enabled OAuth provider.',
      });
    }
    const { email } = request.body ?? {};
    if (!email || typeof email !== 'string') {
      return reply.status(400).send({ error: 'EMAIL_REQUIRED' });
    }
    const trimmed = email.toLowerCase().trim();
    const user = await db.User.findOne({ email: trimmed }).lean();
    // Always respond success to avoid email enumeration
    if (!user) return reply.send({ ok: true, message: 'If that email exists, a login link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    await magicLinkRedis.storeToken(token, user._id).catch(() => {});

    const appUrl = process.env.APP_URL || 'https://milloapp.com';
    const link   = `${appUrl.replace(/\/+$/, '')}/auth/magic-link/verify?token=${encodeURIComponent(token)}`;

    const { sendEmailWithInboxFallback } = require('../services/notificationService');
    await sendEmailWithInboxFallback({
      to: user.email,
      subject: 'Sign in to Millo',
      title: 'Your secure login link',
      body: 'Click the button below to sign in. This link expires in 10 minutes. If you did not request this, you can ignore this email.',
      ctaUrl: link,
      ctaText: 'Sign in',
      userId: user._id,
      type: 'auth_magic_link',
    });

    return reply.send({ ok: true, message: 'If that email exists, a login link has been sent.' });
  });

  /* ── Magic link: verify token and create session ── */
  app.get('/auth/magic-link/verify', async (request, reply) => {
    const { token } = request.query ?? {};
    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ error: 'TOKEN_REQUIRED' });
    }

    const userId = await magicLinkRedis.consumeToken(token).catch(() => null);
    if (!userId) {
      return reply.status(400).send({ error: 'INVALID_OR_EXPIRED_TOKEN', message: 'Magic link is invalid or has expired.' });
    }

    const user = await db.User.findById(userId).lean();
    if (!user) {
      return reply.status(400).send({ error: 'USER_NOT_FOUND' });
    }

    const status = user.status || 'active';
    if (status === 'suspended') return reply.status(403).send({ error: 'ACCOUNT_SUSPENDED', message: 'Your account has been suspended.' });
    if (status === 'banned') return reply.status(403).send({ error: 'ACCOUNT_BANNED', message: 'Your account has been permanently suspended.' });
    if (status === 'restricted') {
      return reply.status(403).send({
        error: 'ACCOUNT_RESTRICTED',
        message: 'Your account is restricted due to risk signals. Contact support.',
      });
    }

    const sessionToken = newToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    let magicSession = null;
    try {
      magicSession = await db.Session.create({
        userId: user._id,
        token: sessionToken,
        expiresAt,
        lastSeen: new Date(),
      });
    } catch (_) {}
    if (magicSession) {
      fraudService.notifySiftLogin(user._id, {
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        sessionId: String(magicSession._id),
        optOutFingerprinting: !!user.optOutFingerprinting,
        $user_email: user.email,
      }).catch(() => {});
    }

    const profile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
    const jwtToken = signJwt(user._id);

    const accept = (request.headers['accept'] || '').toLowerCase();
    if (accept.includes('text/html')) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl.replace(/\/+$/, '')}/magic-link/callback?token=${encodeURIComponent(sessionToken)}`;
      return reply.redirect(redirectUrl, 302);
    }

    return reply.send({
      ok: true,
      token: sessionToken,
      ...(jwtToken && { jwt: jwtToken }),
      user: authUserResponse(user, profile),
    });
  });

  /* ── Logout ── */
  app.post('/auth/logout', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (token) await db.Session.deleteOne({ token }).catch(() => {});
    return reply.send({ ok: true });
  });

  /* ── Password reset — request ── */
  app.post('/auth/password-reset/request', { config: { rateLimit: RESET_RATE_LIMIT } }, async (request, reply) => {
    const { email } = request.body ?? {};
    if (!email) return reply.status(400).send({ error: 'EMAIL_REQUIRED' });

    const user = await db.User.findOne({ email: email.toLowerCase().trim() }).lean();
    // Always return 200 to prevent email enumeration
    if (!user) return reply.send({ ok: true, message: 'If that email exists, a reset link has been sent.' });

    const resetToken = newToken();
    const expiresAt  = new Date(Date.now() + RESET_TTL_MS);

    await db.PlatformSettings.findOneAndUpdate(
      { key: `reset:${user._id}` },
      { $set: { key: `reset:${user._id}`, value: { token: resetToken, expiresAt } } },
      { upsert: true }
    );

    const appUrl   = process.env.APP_URL || 'https://milloapp.com';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}&uid=${user._id}`;

    const { sendEmailWithInboxFallback } = require('../services/notificationService');
    await sendEmailWithInboxFallback({
      to: user.email,
      subject: 'Reset your Millo password',
      title: 'Reset your password',
      body: 'Click the button below to reset your password. This link expires in 1 hour. If you did not request this, ignore this email.',
      ctaUrl: resetUrl,
      ctaText: 'Reset Password',
      userId: user._id,
      type: 'password_reset',
    });

    return reply.send({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  });

  /* ── Password reset — confirm ── */
  app.post('/auth/password-reset/confirm', { config: { rateLimit: RESET_RATE_LIMIT } }, async (request, reply) => {
    const { token, userId, newPassword } = request.body ?? {};
    if (!token || !userId || !newPassword) return reply.status(400).send({ error: 'MISSING_FIELDS' });
    if (newPassword.length < 8) return reply.status(400).send({ error: 'PASSWORD_TOO_SHORT' });

    const record = await db.PlatformSettings.findOne({ key: `reset:${userId}` }).lean();
    if (!record?.value?.token || record.value.token !== token) return reply.status(400).send({ error: 'INVALID_OR_EXPIRED_TOKEN' });
    if (new Date(record.value.expiresAt) < new Date()) return reply.status(400).send({ error: 'TOKEN_EXPIRED' });

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.User.findByIdAndUpdate(userId, { $set: { 'flags.passwordHash': hash } });
    // Invalidate all sessions after reset
    await db.Session.deleteMany({ userId });
    // Delete reset token
    await db.PlatformSettings.deleteOne({ key: `reset:${userId}` });

    return reply.send({ ok: true, message: 'Password updated. Please sign in with your new password.' });
  });

  /* ── Verify email ── */
  app.get('/auth/verify-email', async (request, reply) => {
    const { token } = request.query ?? {};
    const result = await verifyEmailToken(token);
    if (!result.ok) {
      return reply.status(400).send({ error: result.error });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const accept = (request.headers['accept'] || '').toLowerCase();
    if (accept.includes('application/json')) {
      return reply.send({ ok: true, redirect: `${frontendUrl}/verify-email/success` });
    }
    return reply.redirect(`${frontendUrl}/verify-email/success`, 302);
  });

  /* ── Resend verification email ── */
  app.post('/auth/resend-verification', { config: { rateLimit: RESET_RATE_LIMIT } }, async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (user.emailVerified || user.flags?.emailVerified) return reply.send({ ok: true, message: 'Already verified.' });

    await sendEmailVerification(user, {
      title: 'Verify your email',
      body: 'Click the button below to verify your email address.',
    }).catch((err) => request.log.warn({ err, userId: String(user._id) }, 'Failed to send re-verification email'));

    return reply.send({ ok: true });
  });

  /* ── Sessions — list sessions for current user (multi-device); includes revoked ── */
  app.get('/auth/sessions', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const sessions = await db.Session.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .select('_id createdAt expiresAt deviceId ip userAgent lastSeen revoked revokedAt meta')
      .lean();

    const currentToken = token;
    const now = new Date();
    const sessionsOut = sessions.map((s) => {
      const createdAt = s.createdAt || (s._id ? s._id.getTimestamp?.() : null);
      const expired = s.expiresAt <= now;
      return {
        id: s._id,
        createdAt,
        expiresAt: s.expiresAt,
        deviceId: s.deviceId || null,
        ip: s.ip || null,
        userAgent: s.userAgent || null,
        lastSeen: s.lastSeen || null,
        revoked: !!s.revoked,
        revokedAt: s.revokedAt || null,
        deviceType: s.meta?.deviceType || 'web',
        isCurrent: false,
        expired,
      };
    });

    const currentSession = await db.Session.findOne({ token: currentToken, userId: user._id, revoked: { $ne: true } }).select('_id').lean();
    if (currentSession) {
      const idx = sessionsOut.findIndex((s) => String(s.id) === String(currentSession._id));
      if (idx >= 0) sessionsOut[idx].isCurrent = true;
    }

    return reply.send({ ok: true, sessions: sessionsOut });
  });


  /* ── Me — get current user ── */
  app.get('/auth/me', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    return reply.send({
      ok: true,
      user: authUserResponse(user, profile, { riskLock: user.riskLock ?? false }),
    });
  });

  /* ── Privacy-related preferences (authenticated) ── */
  app.patch('/auth/me/preferences', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { optOutFingerprinting } = request.body ?? {};
    if (optOutFingerprinting !== undefined && typeof optOutFingerprinting !== 'boolean') {
      return reply.status(400).send({
        error: 'INVALID_OPT_OUT_FINGERPRINTING',
        message: 'optOutFingerprinting must be a boolean',
      });
    }
    const patch = {};
    if (optOutFingerprinting !== undefined) patch.optOutFingerprinting = optOutFingerprinting;
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'NOTHING_TO_UPDATE' });
    await db.User.findByIdAndUpdate(user._id, { $set: patch });
    const fresh = await db.User.findById(user._id).lean();
    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    await writeAuditLog({
      action: 'privacy_preference_update',
      userId: user._id,
      meta: patch,
    }).catch(() => {});
    return reply.send({ ok: true, user: authUserResponse(fresh, profile, { riskLock: fresh.riskLock ?? false }) });
  });

  /* ── Change password (authenticated user; e.g. admin changing temporary install credentials) ── */
  app.post('/auth/me/change-password', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { requireNoRiskLock, requireNotEnforcementRateLimited } = require('../middleware/riskLock');
    if (!requireNoRiskLock(request, reply)) return;
    if (!(await requireNotEnforcementRateLimited(request, reply))) return;

    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || !newPassword) return reply.status(400).send({ error: 'CURRENT_AND_NEW_PASSWORD_REQUIRED' });
    if (newPassword.length < 8) return reply.status(400).send({ error: 'PASSWORD_TOO_SHORT', message: 'New password must be at least 8 characters.' });

    const doc = await db.User.findById(user._id).select('flags').lean();
    const hash = doc?.flags?.passwordHash;
    if (!hash) return reply.status(400).send({ error: 'NO_PASSWORD_SET', message: 'This account has no password (e.g. OAuth-only). Use password reset flow.' });

    const ok = await bcrypt.compare(currentPassword, hash);
    if (!ok) return reply.status(401).send({ error: 'INVALID_CURRENT_PASSWORD' });

    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.User.findByIdAndUpdate(user._id, { $set: { 'flags.passwordHash': newHash } });
    return reply.send({ ok: true, message: 'Password updated. Use your new password to sign in next time.' });
  });

  /* ── Step-up verification (risk lock): send email OTP ── */
  const STEP_UP_OTP_TTL_MS = 10 * 60 * 1000;
  app.post('/auth/verification/send-email', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!user.riskLock) return reply.send({ ok: true, message: 'No verification required.' });
    if (!getCapabilities().notifications.email) {
      return reply.status(503).send({
        error: 'EMAIL_NOT_CAPABLE',
        message: 'Email verification cannot be sent: outbound email is disabled for this deployment.',
      });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + STEP_UP_OTP_TTL_MS);
    const tokenValue = `risk_lock_otp:${user._id}:${code}`;
    await db.VerificationToken.deleteMany({ userId: user._id, type: 'risk_lock_otp' });
    await db.VerificationToken.create({ userId: user._id, token: tokenValue, type: 'risk_lock_otp', expiresAt });
    await sendCustomerEmail({
      template: 'step_up_verification',
      to: user.email,
      subject: 'Verify your identity',
      title: 'Verify your identity',
      body: `Your verification code is: ${code}. It expires in 10 minutes.`,
    }).catch((err) => {
      request.log.warn({ err, userId: String(user._id) }, 'Step-up verification email failed');
    });
    return reply.send({ ok: true, message: 'Verification code sent to your email.' });
  });

  /* ── Step-up verification: complete (validate OTP and clear risk lock) ── */
  app.post('/auth/verification/complete', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { code } = request.body ?? {};
    if (!code || typeof code !== 'string') return reply.status(400).send({ error: 'CODE_REQUIRED', message: 'Verification code is required.' });

    const tokenValue = `risk_lock_otp:${user._id}:${String(code).trim()}`;
    const vt = await db.VerificationToken.findOneAndDelete({
      userId: user._id,
      type: 'risk_lock_otp',
      token: tokenValue,
      expiresAt: { $gt: new Date() },
    });
    if (!vt) return reply.status(400).send({ error: 'INVALID_OR_EXPIRED_CODE', message: 'Invalid or expired verification code.' });

    const accountTakeoverService = require('../services/accountTakeoverService');
    await accountTakeoverService.clearRiskLock(user._id);
    return reply.send({ ok: true, message: 'Verification complete. You can now perform sensitive actions.' });
  });

  /* ── Refresh session — extend TTL and issue a new token ── */
  app.post('/auth/refresh', async (request, reply) => {
    const oldToken = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (!oldToken) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const session = await db.Session.findOne({ token: oldToken }).lean();
    if (!session) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const user    = await db.User.findById(session.userId).lean();
    if (!user)    return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const freshToken = newToken();
    const expiresAt  = new Date(Date.now() + SESSION_TTL_MS);
    const device     = sessionFieldsFromRequest(request);

    // Create fresh session and invalidate the old one atomically
    await Promise.all([
      db.Session.create({ userId: user._id, token: freshToken, expiresAt, ...device }),
      db.Session.deleteOne({ token: oldToken }),
    ]);

    const profile = await db.Profile.findOne({ userId: user._id }).lean();
    return reply.send({
      ok: true,
      token: freshToken,
      user: authUserResponse(user, profile),
    });
  });

  /* ── Session invalidate (revoke) — sets revoked so session cannot be used; keeps record for device list ── */
  app.post('/auth/sessions/:sessionId/invalidate', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const session = await db.Session.findById(request.params.sessionId);
    if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' });
    if (session.userId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    await db.Session.updateOne({ _id: session._id }, { $set: { revoked: true, revokedAt: new Date() } });
    return reply.send({ ok: true });
  });

  /* ── Revoke session by ID (DELETE) — for device management UI ── */
  app.delete('/auth/sessions/:sessionId', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const session = await db.Session.findById(request.params.sessionId);
    if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' });
    if (session.userId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    await db.Session.updateOne({ _id: session._id }, { $set: { revoked: true, revokedAt: new Date() } });
    return reply.send({ ok: true });
  });

  /* ── Account session list (multi-device session registry: GET /account/sessions) ── */
  app.get('/account/sessions', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const sessions = await db.Session.find({ userId: user._id }).sort({ createdAt: -1 })
      .select('_id createdAt expiresAt deviceId deviceName ip ipAddress userAgent location lastSeen lastActiveAt revoked revokedAt meta').lean();
    const currentToken = token;
    const now = new Date();
    const sessionsOut = sessions.map((s) => ({
      id: s._id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      deviceId: s.deviceId || null,
      deviceName: s.deviceName || null,
      ip: s.ip || s.ipAddress || null,
      ipAddress: s.ipAddress || s.ip || null,
      userAgent: s.userAgent || null,
      location: s.location || null,
      lastSeen: s.lastSeen || null,
      lastActiveAt: s.lastActiveAt || null,
      revoked: !!s.revoked,
      revokedAt: s.revokedAt || null,
      deviceType: s.meta?.deviceType || 'web',
      isCurrent: false,
      expired: s.expiresAt <= now,
    }));
    const currentSession = await db.Session.findOne({ token: currentToken, userId: user._id, revoked: { $ne: true } }).select('_id').lean();
    if (currentSession) {
      const idx = sessionsOut.findIndex((s) => String(s.id) === String(currentSession._id));
      if (idx >= 0) sessionsOut[idx].isCurrent = true;
    }
    return reply.send({ ok: true, sessions: sessionsOut });
  });

  /* ── Revoke session (DELETE /account/sessions/:id) ── */
  app.delete('/account/sessions/:sessionId', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const session = await db.Session.findById(request.params.sessionId);
    if (!session) return reply.status(404).send({ error: 'SESSION_NOT_FOUND' });
    if (session.userId.toString() !== user._id.toString()) return reply.status(403).send({ error: 'FORBIDDEN' });
    await db.Session.updateOne({ _id: session._id }, { $set: { revoked: true, revokedAt: new Date() } });
    return reply.send({ ok: true });
  });

  /* ── Revoke all other sessions (DELETE /account/sessions — keep current) ── */
  app.delete('/account/sessions', async (request, reply) => {
    const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
    const user  = await resolveSession(token);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const currentSession = await db.Session.findOne({ token, userId: user._id, revoked: { $ne: true } }).select('_id').lean();
    const result = await db.Session.updateMany(
      { userId: user._id, _id: { $ne: currentSession?._id } },
      { $set: { revoked: true, revokedAt: new Date() } }
    );
    return reply.send({ ok: true, revokedCount: result.modifiedCount });
  });

  /* ── OAuth providers (which are enabled for frontend) ── */
  app.get('/auth/oauth/providers', (request, reply) => {
    return reply.send(oauthProviders.getOAuthProviders());
  });

  /* ── OAuth (Google / Facebook / Apple) ── */
  app.get('/auth/oauth/google',            oauthRedirect('google'));
  app.get('/auth/oauth/google/callback',   oauthCallback('google'));
  app.get('/auth/oauth/facebook',          oauthRedirect('facebook'));
  app.get('/auth/oauth/facebook/callback', oauthCallback('facebook'));
  app.get('/auth/oauth/apple', (request, reply) => {
    try {
      requireProviderConfigured('apple');
      identityControl.assertOAuthProviderLive('apple');
    } catch (err) {
      request.log?.warn?.({ err: err.code }, 'Apple OAuth start blocked');
      if (err.code === 'IDENTITY_OAUTH_NOT_LIVE') {
        if (process.env.NODE_ENV === 'production') {
          return reply.redirect(getLoginRedirectUrl(`oauth_error=${err.code}&provider=apple&status=${encodeURIComponent(err.status || '')}`), 302);
        }
        return reply.status(403).send({ error: err.code, message: err.message, provider: 'apple', status: err.status });
      }
      if (process.env.NODE_ENV === 'production') {
        return reply.redirect(getLoginRedirectUrl(`oauth_error=${err.code || 'provider_disabled'}&provider=apple`), 302);
      }
      return reply.status(400).send({
        error: err.code || 'OAUTH_NOT_CONFIGURED',
        message: err.message,
        provider: 'apple',
        missingEnvVars: err.missingEnvVars,
      });
    }
    const clientId    = process.env.OAUTH_APPLE_CLIENT_ID;
    const appUrl      = process.env.APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/auth/oauth/apple/callback`;
    const url = `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code%20id_token&response_mode=form_post&scope=name%20email`;
    return reply.redirect(url, 302);
  });
  app.post('/auth/oauth/apple/callback', async (request, reply) => {
    return handleAppleCallback(request, reply);
  });
}

module.exports = { authRoutes, resolveSession, authUserResponse };
