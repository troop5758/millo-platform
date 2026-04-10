/**
 * Config binding — Phase 1. Binds config from env. No business logic.
 * https://milloapp.com
 */

const DOMAIN = 'https://milloapp.com';

function bind(opts) {
  opts = opts || {};
  return {
    port: Number(process.env.PORT) || opts.port || 3000,
    host: process.env.HOST || opts.host || '0.0.0.0',
    nodeEnv: process.env.NODE_ENV || opts.nodeEnv || 'development',
    appUrl: process.env.PUBLIC_APP_URL || process.env.APP_URL || opts.appUrl || DOMAIN,
  };
}

module.exports = { bind, DOMAIN };
