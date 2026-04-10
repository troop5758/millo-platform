'use strict';
/**
 * Pricing routes — public config + admin CRUD + geo detection.
 *
 * GET  /pricing/geo                  → detect country from IP headers
 * GET  /pricing/config?country=BR    → public region-adjusted config
 * GET  /pricing/admin/config         → full config + region data (admin)
 * POST /pricing/admin/config         → patch base pricing fields (admin)
 * POST /pricing/admin/config/reset   → reset a field to default (admin)
 * GET  /pricing/admin/regions        → tier multipliers + FX rates (admin)
 * POST /pricing/admin/regions        → update tier multipliers or FX (admin)
 * https://milloapp.com
 */
const { pricing, globalPricing } = require('@millo/economy');
const { regions }        = pricing;
const { resolveSession } = require('./auth');
const { writeAdminAuditLog } = require('../services/auditLog');
const { validateId }    = require('../lib/validateId');
const db                = require('@millo/database');

async function requireAdmin(request, reply) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  const user  = token ? await resolveSession(token).catch(() => null) : null;
  if (!user || user.role !== 'admin') {
    reply.status(403).send({ error: 'FORBIDDEN' });
    return null;
  }
  return user;
}

/** Public fields exposed to all users. */
const PUBLIC_FIELDS = ['coinPacks', 'giftCosts', 'subscriptionTiers', 'coinsPerDollar', 'ppvMinCents', 'ppvMaxCents'];

/**
 * Extract country code from request.
 * Priority: CF-IPCountry header → X-Country-Code header → geoip-lite → 'US'
 */
function detectCountry(request) {
  // Cloudflare sets this automatically
  const cf = request.headers['cf-ipcountry'];
  if (cf && cf !== 'XX' && cf.length === 2) return cf.toUpperCase();

  // Custom header from nginx/load balancer
  const custom = request.headers['x-country-code'];
  if (custom && custom.length === 2) return custom.toUpperCase();

  // geoip-lite (optional — installed separately)
  try {
    const geoip = require('geoip-lite');
    const ip    = request.headers['x-forwarded-for']?.split(',')[0]?.trim()
               ?? request.ip
               ?? '127.0.0.1';
    const geo = geoip.lookup(ip);
    if (geo?.country) return geo.country.toUpperCase();
  } catch (_) {
    // geoip-lite not installed or lookup failed — fall through
  }

  return 'US';
}

async function pricingRoutes(app) {

  /* ── Phase 1: Full region context (user_country, currency, language, tax, compliance, legal) ── */
  app.get('/region', async (request, reply) => {
    const r = request.region || {};
    return reply.send({
      ok: true,
      user_country: r.user_country || 'US',
      user_currency: r.user_currency || 'USD',
      user_language: r.user_language || 'en',
      user_tax_region: r.user_tax_region || 'US',
      user_compliance_zone: r.user_compliance_zone || 'US',
      vat_rate: r.vat_rate ?? 0,
      price_multiplier: r.multiplier ?? 1,
      tax_inclusive: r.tax_inclusive ?? false,
      adult_content_allowed: r.adult_content_allowed ?? true,
      age_verification_required: r.age_verification_required ?? false,
      data_privacy_law: r.data_privacy_law || 'DEFAULT',
      local_payment_methods: r.local_payment_methods || ['card', 'paypal'],
    });
  });

  /* ── Geo detection ── */
  app.get('/pricing/geo', async (request, reply) => {
    const country  = detectCountry(request);
    const region   = regions.getRegionForCountry(country);
    return reply.send({
      ok: true,
      country,
      currency:    region.currency,
      tier:        region.id,
      tierLabel:   region.label,
      multiplier:  region.multiplier,
      description: region.description,
    });
  });

  /* ── Phase 2: Product-localized price (region + FX) ── */
  app.get('/pricing/product/:productId', async (request, reply) => {
    const productId = request.params.productId;
    if (!validateId(productId, reply)) return;
    const regionCode = request.query.region || request.region?.user_compliance_zone || 'US';
    const countryCode = request.query.country || request.region?.user_country || 'US';
    const region = globalPricing.getRegionCodeFromCountry(countryCode) || regionCode;
    try {
      const result = await globalPricing.getProductPrice(productId, region);
      if (!result) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND' });
      return reply.send({ ok: true, ...result, regionCode: region });
    } catch (e) {
      return reply.status(500).send({ error: 'PRICING_ERROR', message: e.message });
    }
  });

  /* ── Public: region-adjusted config ── */
  app.get('/pricing/config', async (request, reply) => {
    // Accept ?country=BR query param or auto-detect from IP
    const country = (request.query.country || detectCountry(request)).toUpperCase();
    const full    = pricing.getRegionConfig(country);
    const pub     = {};
    for (const f of PUBLIC_FIELDS) pub[f] = full[f];
    pub.region = full.region;
    return reply.send({ ok: true, config: pub });
  });

  /* ── Admin: read full config + region data ── */
  app.get('/pricing/admin/config', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return reply.send({
      ok:       true,
      config:   pricing.getConfig(),
      defaults: pricing.DEFAULTS,
      regions:  {
        tiers:         regions.getTiers(),
        defaultTiers:  regions.DEFAULT_TIERS,
        fx:            regions.getFx(),
        defaultFx:     regions.DEFAULT_FX,
        countryMap:    regions.COUNTRY_MAP,
        currencyConfig: regions.CURRENCY_CONFIG,
      },
    });
  });

  /* ── Admin: patch base pricing fields ── */
  app.post('/pricing/admin/config', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const patch = request.body ?? {};
    if (!Object.keys(patch).length) return reply.status(400).send({ error: 'EMPTY_PATCH' });
    const result = await pricing.applyPatch(patch, String(user._id));
    await writeAdminAuditLog({
      adminId: user._id, action: 'pricing_config_update', meta: { fields: Object.keys(patch) },
    });
    return reply.send(result);
  });

  /* ── Admin: reset a field to default ── */
  app.post('/pricing/admin/config/reset', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { field } = request.body ?? {};
    if (!field || pricing.DEFAULTS[field] === undefined) {
      return reply.status(400).send({ error: 'UNKNOWN_FIELD' });
    }
    const result = await pricing.applyPatch({ [field]: pricing.DEFAULTS[field] }, String(user._id));
    await writeAdminAuditLog({
      adminId: user._id, action: 'pricing_field_reset', meta: { field },
    });
    return reply.send(result);
  });

  /* ── Admin: get region tiers + FX ── */
  app.get('/pricing/admin/regions', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    return reply.send({
      ok:           true,
      tiers:        regions.getTiers(),
      defaultTiers: regions.DEFAULT_TIERS,
      fx:           regions.getFx(),
      defaultFx:    regions.DEFAULT_FX,
    });
  });

  /* ── Admin: update tier multipliers or FX rates ── */
  app.post('/pricing/admin/regions', async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { tiers, fx } = request.body ?? {};
    if (!tiers && !fx) return reply.status(400).send({ error: 'PROVIDE_TIERS_OR_FX' });
    const result = await pricing.applyRegionPatch({ tiers, fx }, String(user._id));
    await writeAdminAuditLog({
      adminId: user._id, action: 'pricing_regions_update',
      meta: { updatedTiers: !!tiers, updatedFx: !!fx },
    });
    return reply.send(result);
  });
}

module.exports = { pricingRoutes };
