'use strict';
/**
 * Password-login RBA — `POST /auth/login` is registered in `auth.js` (Fastify).
 * This module re-exports the RBA service for discovery and tests.
 * https://milloapp.com
 */
module.exports = require('../services/loginRba.service');
