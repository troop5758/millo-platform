'use strict';
/**
 * Defaults for Set-Cookie when the SPA is on https://milloapp.com and the API is on https://api.milloapp.com.
 * Use with @fastify/cookie or reply.setCookie — cross-site credentialed requests need SameSite=None; Secure.
 * https://milloapp.com
 */

/** @returns {Record<string, unknown>} Options for reply.setCookie / @fastify/cookie */
function getSessionCookieOptions() {
  const prod = process.env.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: prod,
    sameSite: prod ? 'none' : 'lax',
  };
}

module.exports = { getSessionCookieOptions };
