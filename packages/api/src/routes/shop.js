'use strict';

// Per-route rate-limit configs
const BID_RATE_LIMIT = {
  max: 20,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many bids — please slow down' }),
};
const STORE_ANALYTICS_RATE_LIMIT = {
  max: 120,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({ error: 'RATE_LIMITED', message: 'Too many analytics events' }),
};

let _broadcastToAuction = null;
let _broadcastToStream = null;
function getBroadcastToAuction() {
  if (!_broadcastToAuction) {
    try { _broadcastToAuction = require('./live').broadcastToAuction; } catch { _broadcastToAuction = () => {}; }
  }
  return _broadcastToAuction;
}
function getBroadcastToStream() {
  if (!_broadcastToStream) {
    try { _broadcastToStream = require('./live').broadcastToStream; } catch { _broadcastToStream = () => {}; }
  }
  return _broadcastToStream;
}
/**
 * Shop routes — product CRUD, auction listing + bidding.
 *
 * GET  /shop/products                     → browse products (filter by creatorId, category)
 * GET  /shop/products/:id                 → single product
 * POST /shop/products                     → create product (auth)
 * PUT  /shop/products/:id                 → update product (auth + owner)
 * DELETE /shop/products/:id               → archive product (auth + owner)
 *
 * GET  /shop/creator/:creatorId/products  → all active products for a creator
 * GET  /shop/creator/:creatorId/auctions  → all live/upcoming auctions for a creator
 *
 * GET  /shop/orders                       → my orders (auth)
 *
 * POST /shop/seller-verification          → submit seller verification (auth)
 * GET  /shop/seller-verification          → get own verification status (auth)
 *
 * GET  /shop/auctions/:id                 → single auction (bids included)
 * POST /shop/auctions                     → create auction (auth)
 * POST /shop/auctions/:id/bid             → place a bid (auth)
 * POST /shop/auctions/:id/end             → end auction early (auth + owner)
 *
 * https://milloapp.com
 */
const db = require('@millo/database');
const { appendEntry } = require('@millo/economy');
const { resolveSession } = require('./auth');
const { validateId } = require('../lib/validateId');
const { withAuctionLock, withOrderedWalletLocks, withWalletLock, LockContentionError } = require('../lib/walletLock');
const storeAnalyticsService = require('../services/storeAnalyticsService');
const commerceIntegrity = require('../services/commerceIntegrity.service');
const { trackEvent } = require('../server/services/analytics');
const { notifyUser } = require('../lib/notifyUser');

/** Align with `packages/economy/src/reassignment.js` (AUCTION_PAYMENT_WINDOW_HOURS, default 24). */
function nextAuctionPaymentDeadline() {
  const h = Math.max(1, Number(process.env.AUCTION_PAYMENT_WINDOW_HOURS) || 24);
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function shopRoutes(app) {

  /* ══════════════════════════════════════
     PRODUCTS
  ══════════════════════════════════════ */

  /* Browse products */
  app.get('/shop/products', async (request, reply) => {
    const { creatorId, category, status = 'active', limit = 20, offset = 0, q } = request.query ?? {};
    const filter = { status };
    if (creatorId) filter.creatorId = creatorId;
    if (category)  filter.category  = category;
    if (q)         filter.$text     = { $search: q };

    const [products, total] = await Promise.all([
      db.Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .lean(),
      db.Product.countDocuments(filter),
    ]);
    return reply.send({ products, total, count: products.length });
  });

  /* Single product */
  app.get('/shop/products/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const product = await db.Product.findById(request.params.id).lean();
    if (!product) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (product.status === 'removed') return reply.status(404).send({ error: 'NOT_FOUND' });
    return reply.send({ product });
  });

  /* Create product */
  app.post('/shop/products', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { name, description, priceCents, currency, imageUrls, category, contentCategory = 'safe', inventory, tags, status, originCountry, hsCode, weightKg, declaredValueCents, customsMode = 'DAP' } = request.body ?? {};
    if (!name?.trim()) return reply.status(400).send({ error: 'NAME_REQUIRED' });
    if (name.trim().length > 200) return reply.status(400).send({ error: 'NAME_TOO_LONG', message: 'Product name must be 200 characters or fewer' });
    if (description && description.length > 5000) return reply.status(400).send({ error: 'DESCRIPTION_TOO_LONG', message: 'Description must be 5,000 characters or fewer' });
    if (!priceCents && priceCents !== 0) return reply.status(400).send({ error: 'PRICE_REQUIRED' });
    if (!Number.isInteger(Number(priceCents)) || Number(priceCents) < 0) return reply.status(400).send({ error: 'INVALID_PRICE', message: 'priceCents must be a non-negative integer' });
    if (imageUrls !== undefined && !Array.isArray(imageUrls)) return reply.status(400).send({ error: 'INVALID_IMAGE_URLS', message: 'imageUrls must be an array' });
    if (tags !== undefined && !Array.isArray(tags)) return reply.status(400).send({ error: 'INVALID_TAGS', message: 'tags must be an array' });
    if (!['safe', 'mature', 'explicit'].includes(contentCategory)) {
      return reply.status(400).send({ error: 'INVALID_CONTENT_CATEGORY', message: 'contentCategory must be safe | mature | explicit' });
    }
    if (!['DAP', 'DDP'].includes(customsMode)) {
      return reply.status(400).send({ error: 'INVALID_CUSTOMS_MODE', message: 'customsMode must be DAP | DDP' });
    }
    if (originCountry !== undefined && originCountry !== null && String(originCountry).trim().length !== 2) {
      return reply.status(400).send({ error: 'INVALID_ORIGIN_COUNTRY', message: 'originCountry must be ISO 3166-1 alpha-2 (2 letters)' });
    }
    if (weightKg !== undefined && weightKg !== null && (Number(weightKg) < 0 || isNaN(Number(weightKg)))) {
      return reply.status(400).send({ error: 'INVALID_WEIGHT', message: 'weightKg must be a non-negative number' });
    }
    if (declaredValueCents !== undefined && declaredValueCents !== null && (Number(declaredValueCents) < 0 || !Number.isInteger(Number(declaredValueCents)))) {
      return reply.status(400).send({ error: 'INVALID_DECLARED_VALUE', message: 'declaredValueCents must be a non-negative integer' });
    }

    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isStorefrontEligible(user._id))) {
      return reply.status(403).send({
        error: 'STOREFRONT_RESTRICTED',
        message: 'Storefront access is restricted by your creator reputation score. Please contact support.',
      });
    }
    const storeCustom = await db.StorefrontCustomization.findOne({ creatorId: user._id }).select('storeSuspended').lean();
    if (storeCustom?.storeSuspended) {
      return reply.status(403).send({ error: 'STORE_SUSPENDED', message: 'Your store is suspended. You cannot add products. Contact support.' });
    }

    try {
      await commerceIntegrity.assertSellerVerified(user._id);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    let product;
    try {
      product = await db.Product.create({
        creatorId: user._id, name: name.trim(), description: description || '',
        priceCents: Number(priceCents), currency: currency || 'USD',
        imageUrls: imageUrls || [], category: category || 'general',
        contentCategory: contentCategory || 'safe',
        inventory: inventory ?? -1, tags: tags || [],
        status: status || 'active',
        originCountry: originCountry ? String(originCountry).trim().toUpperCase().slice(0, 2) : undefined,
        hsCode: hsCode ? String(hsCode).trim().slice(0, 20) : undefined,
        weightKg: weightKg != null ? Number(weightKg) : undefined,
        declaredValueCents: declaredValueCents != null ? Number(declaredValueCents) : undefined,
        customsMode: customsMode || 'DAP',
      });
    } catch (err) {
      request.log.error({ err, userId: String(user._id) }, 'Failed to create product');
      return reply.status(500).send({ error: 'CREATE_FAILED', message: 'Failed to create product' });
    }
    return reply.status(201).send({ product: product.toObject() });
  });

  /* ── Seller verification (Phase 5: ID, selfie, address, bank account required) ── */
  app.post('/shop/seller-verification', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const {
      business_name, businessName, tax_id, taxId, document_url, documentUrl,
      idDocumentUrl, id_document_url, selfieUrl, selfie_url, address, bankAccount, bank_account,
    } = request.body ?? {};
    const businessNameVal = businessName || business_name;
    const taxIdVal = taxId || tax_id;
    const documentUrlVal = documentUrl || document_url;
    const idDocUrl = idDocumentUrl || id_document_url;
    const selfie = selfieUrl || selfie_url;
    const addressVal = address;
    const bankAccountVal = bankAccount || bank_account;

    if (!businessNameVal?.trim()) return reply.status(400).send({ error: 'BUSINESS_NAME_REQUIRED' });
    if (!documentUrlVal?.trim()) return reply.status(400).send({ error: 'DOCUMENT_URL_REQUIRED' });
    if (!idDocUrl?.trim()) return reply.status(400).send({ error: 'ID_DOCUMENT_REQUIRED', message: 'ID document URL is required.' });
    if (!selfie?.trim()) return reply.status(400).send({ error: 'SELFIE_REQUIRED', message: 'Selfie URL is required.' });
    if (!addressVal?.trim()) return reply.status(400).send({ error: 'ADDRESS_REQUIRED', message: 'Address is required.' });
    if (!bankAccountVal?.trim()) return reply.status(400).send({ error: 'BANK_ACCOUNT_REQUIRED', message: 'Bank account is required.' });

    const existing = await db.SellerVerification.findOne({ userId: user._id }).sort({ createdAt: -1 });
    if (existing && existing.sellerStatus === 'blocked') {
      return reply.status(403).send({
        error: 'SELLER_BLOCKED',
        message: 'Your seller account is blocked from commerce. Contact support.',
      });
    }
    if (existing && existing.status === 'pending' && (existing.documentUrl || existing.idDocumentUrl)) {
      return reply.status(409).send({ error: 'PENDING_EXISTS', message: 'You already have a verification request under review.' });
    }
    if (existing && (existing.status === 'approved' || existing.sellerStatus === 'verified')) {
      return reply.status(409).send({ error: 'ALREADY_APPROVED', message: 'You are already verified as a seller.' });
    }

    const payload = {
      userId: user._id,
      businessName: String(businessNameVal).trim().slice(0, 200),
      taxId: taxIdVal ? String(taxIdVal).trim().slice(0, 50) : undefined,
      documentUrl: String(documentUrlVal).trim().slice(0, 2048),
      idDocumentUrl: String(idDocUrl).trim().slice(0, 2048),
      selfieUrl: String(selfie).trim().slice(0, 2048),
      address: String(addressVal).trim().slice(0, 500),
      bankAccount: String(bankAccountVal).trim().slice(0, 200),
      status: 'pending',
      sellerStatus: 'pending',
      stage: 'manual_review',
      rejectReason: undefined,
      reviewedBy: undefined,
      reviewedAt: undefined,
    };

    let v;
    let statusCode = 201;
    if (existing && (existing.status === 'draft' || existing.status === 'rejected' ||
      (existing.status === 'pending' && !existing.documentUrl))) {
      existing.set(payload);
      await existing.save();
      v = existing;
      statusCode = 200;
    } else {
      v = await db.SellerVerification.create(payload);
    }
    return reply.status(statusCode).send({ verification: v.toObject() });
  });

  app.get('/shop/seller-verification', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const v = await db.SellerVerification.findOne({ userId: user._id }).sort({ createdAt: -1 }).lean();
    if (!v) return reply.send({ verification: null });
    return reply.send({
      verification: {
        ...v,
        effectiveSellerStatus: commerceIntegrity.getEffectiveSellerStatus(v),
      },
    });
  });

  /* Update product */
  app.put('/shop/products/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const product = await db.Product.findById(request.params.id);
    if (!product) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (product.status === 'removed') return reply.status(404).send({ error: 'NOT_FOUND' });
    if (product.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (user.role !== 'admin') {
      const storeCustom = await db.StorefrontCustomization.findOne({ creatorId: user._id }).select('storeSuspended').lean();
      if (storeCustom?.storeSuspended) return reply.status(403).send({ error: 'STORE_SUSPENDED', message: 'Your store is suspended. Contact support.' });
      try {
        await commerceIntegrity.assertSellerVerified(user._id);
      } catch (err) {
        if (
          err instanceof commerceIntegrity.SellerNotVerifiedError ||
          err instanceof commerceIntegrity.SellerBlockedError
        ) {
          return reply.status(err.statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }

    const allowed = ['name', 'description', 'priceCents', 'imageUrls', 'category', 'contentCategory', 'inventory', 'tags', 'status', 'originCountry', 'hsCode', 'weightKg', 'declaredValueCents', 'customsMode'];
    for (const key of allowed) {
      if (request.body?.[key] !== undefined) {
        if (key === 'contentCategory' && !['safe', 'mature', 'explicit'].includes(request.body[key])) continue;
        if (key === 'customsMode' && !['DAP', 'DDP'].includes(request.body[key])) continue;
        if (key === 'originCountry') { product[key] = String(request.body[key]).trim().toUpperCase().slice(0, 2) || undefined; continue; }
        if (key === 'hsCode') { product[key] = String(request.body[key]).trim().slice(0, 20) || undefined; continue; }
        if (key === 'weightKg') { product[key] = request.body[key] != null ? Number(request.body[key]) : undefined; continue; }
        if (key === 'declaredValueCents') { product[key] = request.body[key] != null ? Number(request.body[key]) : undefined; continue; }
        product[key] = request.body[key];
      }
    }
    await product.save();
    return reply.send({ product: product.toObject() });
  });

  /* Archive (soft-delete) product */
  app.delete('/shop/products/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const product = await db.Product.findById(request.params.id);
    if (!product) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (product.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (user.role !== 'admin') {
      try {
        await commerceIntegrity.assertSellerVerified(user._id);
      } catch (err) {
        if (
          err instanceof commerceIntegrity.SellerNotVerifiedError ||
          err instanceof commerceIntegrity.SellerBlockedError
        ) {
          return reply.status(err.statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }

    product.status = 'archived';
    await product.save();
    return reply.send({ ok: true });
  });

  /* ── Storefront customization (layout themes, branding, section order) ── */
  const LAYOUT_THEMES = db.StorefrontCustomization?.LAYOUT_THEMES ?? ['grid_store', 'creator_brand', 'live_seller', 'auction_house'];
  const STORE_SECTION_TYPES = db.StorefrontCustomization?.STORE_SECTION_TYPES ?? ['hero_banner', 'featured_products', 'product_grid', 'collections', 'live_stream', 'upcoming_auctions', 'creator_video', 'reviews'];
  /** Mobile storefront section order: Creator Banner → Follow (UI) → Products → Collections → Live Stream → Reviews. */
  const MOBILE_SECTION_ORDER = ['hero_banner', 'featured_products', 'product_grid', 'collections', 'live_stream', 'reviews'];

  /** Build public storefront config response from a StorefrontCustomization doc (or defaults). */
  function buildPublicStorefrontConfig(doc, creatorId) {
    const layoutTheme = doc?.layoutTheme ?? 'grid_store';
    const config = doc?.config ?? {};
    const storefrontTheme = doc?.storefrontTheme ?? {};
    const storeLayout = Array.isArray(doc?.storeLayout) ? doc.storeLayout : [];
    const featuredProducts = Array.isArray(doc?.featuredProducts) ? doc.featuredProducts.map((id) => String(id)) : [];
    const collections = (Array.isArray(doc?.collections) ? doc.collections : []).map((c) => ({
      _id: c._id ? String(c._id) : null,
      name: c.name ?? '',
      description: c.description ?? '',
      productIds: (c.productIds || []).map((id) => String(id)),
    }));
    const pv = doc?.promoVideo ?? {};
    const promoVideo = (pv.videoUrl || pv.title || pv.ctaText) ? {
      videoUrl: pv.videoUrl ?? null,
      title: pv.title ?? null,
      thumbnailUrl: pv.thumbnailUrl ?? null,
      ctaText: pv.ctaText ?? null,
    } : null;
    const sm = doc?.storeMetrics ?? {};
    const storeMetrics = {
      rating: sm.rating != null ? Number(sm.rating) : null,
      reviewCount: Math.max(0, Number(sm.reviewCount) || 0),
      verifiedSeller: !!sm.verifiedSeller,
      fastShipping: !!sm.fastShipping,
      topCreator: !!sm.topCreator,
    };
    return {
      creatorId: creatorId || (doc?.creatorId ? String(doc.creatorId) : null),
      storeSlug: doc?.storeSlug ?? null,
      layoutTheme,
      config,
      storefrontTheme: {
        bannerUrl: storefrontTheme.bannerUrl ?? null,
        logoUrl: storefrontTheme.logoUrl ?? null,
        accentColor: storefrontTheme.accentColor ?? null,
        backgroundTheme: storefrontTheme.backgroundTheme ?? 'light',
        backgroundColor: storefrontTheme.backgroundColor ?? null,
        fontFamily: storefrontTheme.fontFamily ?? null,
        description: storefrontTheme.description ?? null,
      },
      storeLayout,
      featuredProducts,
      collections,
      promoVideo,
      storeMetrics,
      layoutOptions: LAYOUT_THEMES.map((t) => ({
        value: t,
        label: t === 'grid_store' ? 'Grid Store (eBay style)' : t === 'creator_brand' ? 'Creator Brand (Shopify style)' : t === 'live_seller' ? 'Live Seller (TikTok Shop style)' : t === 'auction_house' ? 'Auction House' : t,
      })),
      sectionTypes: STORE_SECTION_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) })),
      /** Recommended section order for mobile: Creator Banner, Products, Collections, Live Stream, Reviews. Follow button is shown in the creator banner/header. */
      mobileSectionOrder: MOBILE_SECTION_ORDER,
    };
  }

  /** Public: resolve store slug to creatorId. URLs: milloapp.com/store/saulo or milloapp.com/@saulo/store */
  app.get('/shop/store/:slug', async (request, reply) => {
    const slug = String(request.params.slug || '').trim().toLowerCase();
    if (!slug) return reply.status(400).send({ error: 'SLUG_REQUIRED' });
    const doc = await db.StorefrontCustomization.findOne({ storeSlug: slug }).select('creatorId storeSlug storeSuspended').lean();
    if (!doc || !doc.storeSlug) return reply.status(404).send({ error: 'STORE_NOT_FOUND', message: 'Store not found for this URL.' });
    if (doc.storeSuspended) return reply.status(403).send({ error: 'STORE_SUSPENDED', message: 'This store is currently unavailable.' });
    return reply.send({ creatorId: String(doc.creatorId), slug: doc.storeSlug });
  });

  /** Public: get storefront config by slug (same response as /shop/creator/:creatorId/storefront-config). */
  app.get('/shop/store/:slug/storefront-config', async (request, reply) => {
    const slug = String(request.params.slug || '').trim().toLowerCase();
    if (!slug) return reply.status(400).send({ error: 'SLUG_REQUIRED' });
    const doc = await db.StorefrontCustomization.findOne({ storeSlug: slug }).lean();
    if (!doc || !doc.storeSlug) return reply.status(404).send({ error: 'STORE_NOT_FOUND', message: 'Store not found for this URL.' });
    if (doc.storeSuspended) return reply.status(403).send({ error: 'STORE_SUSPENDED', message: 'This store is currently unavailable.' });
    return reply.send(buildPublicStorefrontConfig(doc, String(doc.creatorId)));
  });

  /** Public: get storefront config for a creator (for rendering storefront page). */
  app.get('/shop/creator/:creatorId/storefront-config', async (request, reply) => {
    const creatorId = request.params.creatorId;
    if (!creatorId) return reply.status(400).send({ error: 'CREATOR_ID_REQUIRED' });
    const doc = await db.StorefrontCustomization.findOne({ creatorId }).lean();
    if (doc?.storeSuspended) return reply.status(403).send({ error: 'STORE_SUSPENDED', message: 'This store is currently unavailable.' });
    return reply.send(buildPublicStorefrontConfig(doc, creatorId));
  });

  /** Public: live shopping — when creator is live, return stream + products featured in stream (TikTok-style: LIVE NOW, video player, Buy Now). */
  app.get('/shop/creator/:creatorId/live-shopping', async (request, reply) => {
    const creatorId = request.params.creatorId;
    if (!creatorId) return reply.status(400).send({ error: 'CREATOR_ID_REQUIRED' });
    const stream = await db.LiveStream.findOne({ userId: creatorId, status: 'live' })
      .sort({ startedAt: -1 })
      .lean();
    if (!stream) {
      return reply.send({ liveNow: false });
    }
    const featuredIds = Array.isArray(stream.featuredProductIds) ? stream.featuredProductIds : [];
    const products = featuredIds.length > 0
      ? await db.Product.find({ _id: { $in: featuredIds }, creatorId, status: 'active' })
          .select('name priceCents currency imageUrls category')
          .lean()
      : [];
    const productOrder = featuredIds.map((id) => id.toString());
    const productsSorted = productOrder
      .map((id) => products.find((p) => String(p._id) === id))
      .filter(Boolean);
    return reply.send({
      liveNow: true,
      stream: {
        _id: stream._id,
        playbackUrl: stream.playbackUrl ?? null,
        title: stream.title ?? null,
        thumbnailUrl: stream.thumbnailUrl ?? null,
        featuredProductIds: productOrder,
      },
      products: productsSorted.map((p) => ({
        _id: p._id,
        name: p.name,
        priceCents: p.priceCents,
        currency: p.currency,
        imageUrls: p.imageUrls ?? [],
        category: p.category,
      })),
    });
  });

  /** Auth: get my storefront customization. */
  app.get('/shop/storefront-customization', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const doc = await db.StorefrontCustomization.findOne({ creatorId: user._id }).lean();
    const layoutTheme = doc?.layoutTheme ?? 'grid_store';
    const config = doc?.config ?? {};
    const st = doc?.storefrontTheme ?? {};
    const storeLayout = Array.isArray(doc?.storeLayout) ? doc.storeLayout : [];
    const featuredProducts = Array.isArray(doc?.featuredProducts) ? doc.featuredProducts.map((id) => String(id)) : [];
    const collections = (Array.isArray(doc?.collections) ? doc.collections : []).map((c) => ({
      _id: c._id ? String(c._id) : null,
      name: c.name ?? '',
      description: c.description ?? '',
      productIds: (c.productIds || []).map((id) => String(id)),
    }));
    const pv = doc?.promoVideo ?? {};
    const promoVideo = (pv.videoUrl || pv.title || pv.ctaText) ? {
      videoUrl: pv.videoUrl ?? null,
      title: pv.title ?? null,
      thumbnailUrl: pv.thumbnailUrl ?? null,
      ctaText: pv.ctaText ?? null,
    } : null;
    const sm = doc?.storeMetrics ?? {};
    const storeMetrics = {
      rating: sm.rating != null ? Number(sm.rating) : null,
      reviewCount: Math.max(0, Number(sm.reviewCount) || 0),
      verifiedSeller: !!sm.verifiedSeller,
      fastShipping: !!sm.fastShipping,
      topCreator: !!sm.topCreator,
    };
    return reply.send({
      creatorId: user._id,
      storeSlug: doc?.storeSlug ?? null,
      storeSuspended: !!doc?.storeSuspended,
      storeSuspendedAt: doc?.storeSuspendedAt ?? null,
      storeSuspendedReason: doc?.storeSuspendedReason ?? null,
      layoutTheme,
      config,
      storefrontTheme: {
        bannerUrl: st.bannerUrl ?? null,
        logoUrl: st.logoUrl ?? null,
        accentColor: st.accentColor ?? null,
        backgroundTheme: st.backgroundTheme ?? 'light',
        backgroundColor: st.backgroundColor ?? null,
        fontFamily: st.fontFamily ?? null,
        description: st.description ?? null,
      },
      storeLayout,
      featuredProducts,
      collections,
      promoVideo,
      storeMetrics,
      mobileSectionOrder: MOBILE_SECTION_ORDER,
    });
  });

  /** Auth: update my storefront customization (layout theme, config, storefront branding). */
  const BACKGROUND_THEMES = db.StorefrontCustomization?.BACKGROUND_THEMES ?? ['light', 'dark'];
  const STORE_SLUG_REGEX = /^[a-z0-9_-]{2,64}$/;
  const RESERVED_STORE_SLUGS = new Set(['store', 'api', 'admin', 'shop', 'creator', 'login', 'signup', 'support', 'help', 'settings']);

  app.put('/shop/storefront-customization', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isStorefrontEligible(user._id))) {
      return reply.status(403).send({
        error: 'STOREFRONT_RESTRICTED',
        message: 'Storefront customization is restricted by your creator reputation score.',
      });
    }
    try {
      await commerceIntegrity.assertSellerVerified(user._id);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
    const { layoutTheme, config, storefrontTheme, storeLayout, featuredProducts, collections, promoVideo: promoVideoBody, storeMetrics: storeMetricsBody, storeSlug: storeSlugBody } = request.body ?? {};
    const update = {};
    if (storeSlugBody !== undefined) {
      if (storeSlugBody === null || storeSlugBody === '') {
        update.storeSlug = null;
      } else {
        const slug = String(storeSlugBody).trim().toLowerCase().slice(0, 64);
        if (!STORE_SLUG_REGEX.test(slug)) {
          return reply.status(400).send({ error: 'INVALID_STORE_SLUG', message: 'Store URL must be 2–64 characters: letters, numbers, hyphens, underscores only.' });
        }
        if (RESERVED_STORE_SLUGS.has(slug)) {
          return reply.status(400).send({ error: 'RESERVED_SLUG', message: 'This store URL is reserved.' });
        }
        const existing = await db.StorefrontCustomization.findOne({ storeSlug: slug }).select('creatorId').lean();
        if (existing && existing.creatorId.toString() !== user._id.toString()) {
          return reply.status(409).send({ error: 'SLUG_TAKEN', message: 'This store URL is already in use.' });
        }
        update.storeSlug = slug;
      }
    }
    const theme = layoutTheme && LAYOUT_THEMES.includes(layoutTheme) ? layoutTheme : undefined;
    if (theme) update.layoutTheme = theme;
    if (config != null && typeof config === 'object') update.config = config;
    const MAX_FEATURED = db.StorefrontCustomization?.MAX_FEATURED_PRODUCTS ?? 12;
    if (Array.isArray(featuredProducts)) {
      const mongoose = require('mongoose');
      const ids = featuredProducts
        .slice(0, MAX_FEATURED)
        .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const owned = ids.length > 0
        ? await db.Product.find({ _id: { $in: ids }, creatorId: user._id, status: 'active' }).select('_id').lean()
        : [];
      const validIds = owned.map((p) => p._id);
      update.featuredProducts = validIds;
    }
    const MAX_COLLECTIONS = db.StorefrontCustomization?.MAX_COLLECTIONS ?? 20;
    const MAX_PRODUCTS_PER_COLLECTION = db.StorefrontCustomization?.MAX_PRODUCTS_PER_COLLECTION ?? 100;
    if (Array.isArray(collections)) {
      const mongoose = require('mongoose');
      const allProductIds = new Set();
      const items = collections.slice(0, MAX_COLLECTIONS).map((c) => {
        const name = typeof c.name === 'string' ? c.name.trim().slice(0, 120) : '';
        if (!name) return null;
        const description = typeof c.description === 'string' ? c.description.trim().slice(0, 500) : '';
        const rawIds = Array.isArray(c.productIds) ? c.productIds.slice(0, MAX_PRODUCTS_PER_COLLECTION) : [];
        const ids = rawIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
        ids.forEach((id) => allProductIds.add(id.toString()));
        return { name, description, ids };
      }).filter(Boolean);
      const ownedProductIds = allProductIds.size > 0
        ? new Set((await db.Product.find({ _id: { $in: Array.from(allProductIds).map((id) => new mongoose.Types.ObjectId(id)) }, creatorId: user._id, status: 'active' }).select('_id').lean()).map((p) => p._id.toString()))
        : new Set();
      const normalized = items.map((item) => ({
        _id: new mongoose.Types.ObjectId(),
        name: item.name,
        description: item.description,
        productIds: item.ids.filter((id) => ownedProductIds.has(id.toString())),
      }));
      update.collections = normalized;
    }
    if (Array.isArray(storeLayout)) {
      const normalized = storeLayout.slice(0, 30).map((s) => {
        const t = s?.type && STORE_SECTION_TYPES.includes(s.type) ? s.type : null;
        if (!t) return null;
        const item = { type: t };
        if (typeof s.title === 'string') item.title = s.title.trim().slice(0, 120);
        if (typeof s.limit === 'number' && s.limit >= 1 && s.limit <= 50) item.limit = Math.floor(s.limit);
        if (s.meta != null && typeof s.meta === 'object') item.meta = s.meta;
        return item;
      }).filter(Boolean);
      update.storeLayout = normalized;
    }
    if (storefrontTheme != null && typeof storefrontTheme === 'object') {
      const st = {};
      if (typeof storefrontTheme.bannerUrl === 'string') st.bannerUrl = storefrontTheme.bannerUrl.trim().slice(0, 2048);
      if (typeof storefrontTheme.logoUrl === 'string') st.logoUrl = storefrontTheme.logoUrl.trim().slice(0, 2048);
      if (typeof storefrontTheme.accentColor === 'string') st.accentColor = storefrontTheme.accentColor.trim().slice(0, 32);
      if (storefrontTheme.backgroundTheme && BACKGROUND_THEMES.includes(storefrontTheme.backgroundTheme)) st.backgroundTheme = storefrontTheme.backgroundTheme;
      if (typeof storefrontTheme.backgroundColor === 'string') st.backgroundColor = storefrontTheme.backgroundColor.trim().slice(0, 32);
      if (typeof storefrontTheme.fontFamily === 'string') st.fontFamily = storefrontTheme.fontFamily.trim().slice(0, 128);
      if (typeof storefrontTheme.description === 'string') st.description = storefrontTheme.description.trim().slice(0, 2000);
      if (Object.keys(st).length > 0) {
        const existing = await db.StorefrontCustomization.findOne({ creatorId: user._id }).select('storefrontTheme').lean();
        const merged = { ...(existing?.storefrontTheme ?? {}), ...st };
        update.storefrontTheme = merged;
      }
    }
    if (promoVideoBody !== undefined) {
      if (promoVideoBody == null || (typeof promoVideoBody === 'object' && !promoVideoBody.videoUrl && !promoVideoBody.title && !promoVideoBody.ctaText)) {
        update.promoVideo = null;
      } else if (typeof promoVideoBody === 'object') {
        const pv = {
          videoUrl: typeof promoVideoBody.videoUrl === 'string' ? promoVideoBody.videoUrl.trim().slice(0, 2048) : null,
          title: typeof promoVideoBody.title === 'string' ? promoVideoBody.title.trim().slice(0, 200) : null,
          thumbnailUrl: typeof promoVideoBody.thumbnailUrl === 'string' ? promoVideoBody.thumbnailUrl.trim().slice(0, 2048) : null,
          ctaText: typeof promoVideoBody.ctaText === 'string' ? promoVideoBody.ctaText.trim().slice(0, 120) : null,
        };
        if (pv.videoUrl || pv.title || pv.ctaText) update.promoVideo = pv;
        else update.promoVideo = null;
      }
    }
    if (storeMetricsBody != null && typeof storeMetricsBody === 'object') {
      const existing = await db.StorefrontCustomization.findOne({ creatorId: user._id }).select('storeMetrics').lean();
      const prev = existing?.storeMetrics ?? {};
      const sm = {
        rating: typeof storeMetricsBody.rating === 'number' ? Math.max(0, Math.min(5, storeMetricsBody.rating)) : (storeMetricsBody.rating === null ? null : prev.rating),
        reviewCount: typeof storeMetricsBody.reviewCount === 'number' ? Math.max(0, Math.floor(storeMetricsBody.reviewCount)) : (storeMetricsBody.reviewCount === null ? 0 : (prev.reviewCount ?? 0)),
        verifiedSeller: typeof storeMetricsBody.verifiedSeller === 'boolean' ? storeMetricsBody.verifiedSeller : (prev.verifiedSeller ?? false),
        fastShipping: typeof storeMetricsBody.fastShipping === 'boolean' ? storeMetricsBody.fastShipping : (prev.fastShipping ?? false),
        topCreator: typeof storeMetricsBody.topCreator === 'boolean' ? storeMetricsBody.topCreator : (prev.topCreator ?? false),
      };
      update.storeMetrics = sm;
    }
    if (Object.keys(update).length === 0) return reply.status(400).send({ error: 'NO_UPDATES', message: 'Provide layoutTheme, config, storeLayout, featuredProducts, collections, promoVideo, storeMetrics, storeSlug, and/or storefrontTheme' });

    const doc = await db.StorefrontCustomization.findOneAndUpdate(
      { creatorId: user._id },
      { $set: update },
      { upsert: true, new: true }
    ).lean();
    const st = doc.storefrontTheme ?? {};
    const storeLayoutOut = Array.isArray(doc.storeLayout) ? doc.storeLayout : [];
    const featuredProductsOut = Array.isArray(doc.featuredProducts) ? doc.featuredProducts.map((id) => String(id)) : [];
    const collectionsOut = (Array.isArray(doc.collections) ? doc.collections : []).map((c) => ({
      _id: c._id ? String(c._id) : null,
      name: c.name ?? '',
      description: c.description ?? '',
      productIds: (c.productIds || []).map((id) => String(id)),
    }));
    const pvOut = doc.promoVideo ?? {};
    const promoVideoOut = (pvOut.videoUrl || pvOut.title || pvOut.ctaText) ? {
      videoUrl: pvOut.videoUrl ?? null,
      title: pvOut.title ?? null,
      thumbnailUrl: pvOut.thumbnailUrl ?? null,
      ctaText: pvOut.ctaText ?? null,
    } : null;
    const smOut = doc.storeMetrics ?? {};
    const storeMetricsOut = {
      rating: smOut.rating != null ? Number(smOut.rating) : null,
      reviewCount: Math.max(0, Number(smOut.reviewCount) || 0),
      verifiedSeller: !!smOut.verifiedSeller,
      fastShipping: !!smOut.fastShipping,
      topCreator: !!smOut.topCreator,
    };
    return reply.send({
      creatorId: user._id,
      storeSlug: doc.storeSlug ?? null,
      storeSuspended: !!doc.storeSuspended,
      storeSuspendedAt: doc.storeSuspendedAt ?? null,
      storeSuspendedReason: doc.storeSuspendedReason ?? null,
      layoutTheme: doc.layoutTheme,
      config: doc.config ?? {},
      storefrontTheme: {
        bannerUrl: st.bannerUrl ?? null,
        logoUrl: st.logoUrl ?? null,
        accentColor: st.accentColor ?? null,
        backgroundTheme: st.backgroundTheme ?? 'light',
        backgroundColor: st.backgroundColor ?? null,
        fontFamily: st.fontFamily ?? null,
        description: st.description ?? null,
      },
      storeLayout: storeLayoutOut,
      featuredProducts: featuredProductsOut,
      collections: collectionsOut,
      promoVideo: promoVideoOut,
      storeMetrics: storeMetricsOut,
      mobileSectionOrder: MOBILE_SECTION_ORDER,
    });
  });

  /* ── Creator coupons (discount codes: SAULO10 → 10%, LIMITEDDROP → $5 off) ── */
  /** POST /shop/coupons/validate — validate code for a creator (used at checkout). Body: { creatorId, code }. */
  app.post('/shop/coupons/validate', async (request, reply) => {
    const { creatorId, code } = request.body ?? {};
    if (!creatorId || !code?.trim()) {
      return reply.status(400).send({ valid: false, message: 'creatorId and code are required' });
    }
    if (!validateId(creatorId, reply)) return;
    const normalized = String(code).trim().toUpperCase();
    const coupon = await db.CreatorCoupon.findOne({
      creatorId,
      code: normalized,
      active: true,
    }).lean();
    if (!coupon) {
      return reply.send({ valid: false, message: 'Invalid or inactive code' });
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date()) {
      return reply.send({ valid: false, message: 'Code has expired' });
    }
    if (coupon.maxRedemptions != null && (coupon.redemptionCount || 0) >= coupon.maxRedemptions) {
      return reply.send({ valid: false, message: 'Code has reached maximum redemptions' });
    }
    return reply.send({
      valid: true,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        amount: coupon.amount,
      },
    });
  });

  /** GET /shop/coupons — list current user's coupons (auth, storefront eligible). */
  app.get('/shop/coupons', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isStorefrontEligible(user._id))) {
      return reply.status(403).send({
        error: 'STOREFRONT_RESTRICTED',
        message: 'Coupon management is restricted. Storefront access required.',
      });
    }
    const coupons = await db.CreatorCoupon.find({ creatorId: user._id })
      .sort({ createdAt: -1 })
      .lean();
    return reply.send({ coupons });
  });

  /** POST /shop/coupons — create coupon (auth, storefront eligible). */
  app.post('/shop/coupons', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isStorefrontEligible(user._id))) {
      return reply.status(403).send({
        error: 'STOREFRONT_RESTRICTED',
        message: 'Coupon creation is restricted. Storefront access required.',
      });
    }
    try {
      await commerceIntegrity.assertSellerVerified(user._id);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
    const { code, discountType, amount, expiresAt, maxRedemptions } = request.body ?? {};
    if (!code?.trim()) return reply.status(400).send({ error: 'CODE_REQUIRED' });
    if (!['percent', 'fixed'].includes(discountType)) {
      return reply.status(400).send({ error: 'INVALID_DISCOUNT_TYPE', message: 'discountType must be percent or fixed' });
    }
    const amountNum = Number(amount);
    if (discountType === 'percent') {
      if (isNaN(amountNum) || amountNum < 0 || amountNum > 100) {
        return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'percent amount must be 0–100' });
      }
    } else {
      if (!Number.isInteger(amountNum) || amountNum < 1) {
        return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'fixed amount must be a positive integer (cents)' });
      }
    }
    const normalizedCode = String(code).trim().toUpperCase().slice(0, 64);
    const existing = await db.CreatorCoupon.findOne({ creatorId: user._id, code: normalizedCode }).lean();
    if (existing) {
      return reply.status(409).send({ error: 'CODE_EXISTS', message: 'A coupon with this code already exists' });
    }
    const doc = {
      creatorId: user._id,
      code: normalizedCode,
      discountType,
      amount: discountType === 'percent' ? amountNum : Math.floor(amountNum),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      maxRedemptions: maxRedemptions != null ? Math.max(0, Math.floor(Number(maxRedemptions))) : null,
    };
    if (isNaN(doc.expiresAt?.getTime())) doc.expiresAt = null;
    const coupon = await db.CreatorCoupon.create(doc);
    return reply.status(201).send({ coupon: coupon.toObject() });
  });

  /** PATCH /shop/coupons/:id — update coupon (auth, owner). */
  app.patch('/shop/coupons/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const coupon = await db.CreatorCoupon.findById(request.params.id);
    if (!coupon) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (coupon.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (user.role !== 'admin') {
      try {
        await commerceIntegrity.assertSellerVerified(user._id);
      } catch (err) {
        if (
          err instanceof commerceIntegrity.SellerNotVerifiedError ||
          err instanceof commerceIntegrity.SellerBlockedError
        ) {
          return reply.status(err.statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
    const { amount, expiresAt, maxRedemptions, active } = request.body ?? {};
    if (amount !== undefined) {
      if (coupon.discountType === 'percent') {
        const n = Number(amount);
        if (isNaN(n) || n < 0 || n > 100) return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'percent amount must be 0–100' });
        coupon.amount = n;
      } else {
        const n = Number(amount);
        if (!Number.isInteger(n) || n < 1) return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'fixed amount must be positive integer (cents)' });
        coupon.amount = Math.floor(n);
      }
    }
    if (expiresAt !== undefined) {
      coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (coupon.expiresAt && isNaN(coupon.expiresAt.getTime())) coupon.expiresAt = null;
    }
    if (maxRedemptions !== undefined) {
      coupon.maxRedemptions = maxRedemptions == null ? null : Math.max(0, Math.floor(Number(maxRedemptions)));
    }
    if (typeof active === 'boolean') coupon.active = active;
    await coupon.save();
    return reply.send({ coupon: coupon.toObject() });
  });

  /** DELETE /shop/coupons/:id — deactivate coupon (auth, owner). */
  app.delete('/shop/coupons/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const coupon = await db.CreatorCoupon.findById(request.params.id);
    if (!coupon) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (coupon.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (user.role !== 'admin') {
      try {
        await commerceIntegrity.assertSellerVerified(user._id);
      } catch (err) {
        if (
          err instanceof commerceIntegrity.SellerNotVerifiedError ||
          err instanceof commerceIntegrity.SellerBlockedError
        ) {
          return reply.status(err.statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }
    coupon.active = false;
    await coupon.save();
    return reply.send({ ok: true });
  });

  /* ── Store analytics (views, clicks, conversion, top products, revenue) ── */
  /** POST /shop/creator/:creatorId/analytics/view — record storefront view (public, rate-limited). */
  app.post('/shop/creator/:creatorId/analytics/view', { config: { rateLimit: STORE_ANALYTICS_RATE_LIMIT } }, async (request, reply) => {
    const creatorId = request.params.creatorId;
    if (!creatorId || !validateId(creatorId, reply)) return;
    await storeAnalyticsService.recordStoreView(creatorId).catch((err) => request.log.warn({ err, creatorId }, 'Store analytics view record failed'));
    return reply.status(204).send();
  });

  /** POST /shop/creator/:creatorId/analytics/click — record product click (public, rate-limited). Body: { productId }. */
  app.post('/shop/creator/:creatorId/analytics/click', { config: { rateLimit: STORE_ANALYTICS_RATE_LIMIT } }, async (request, reply) => {
    const creatorId = request.params.creatorId;
    const { productId } = request.body ?? {};
    if (!creatorId || !validateId(creatorId, reply)) return;
    if (!productId || !validateId(productId, reply)) return;
    const product = await db.Product.findOne({ _id: productId, creatorId, status: 'active' }).select('_id').lean();
    if (!product) return reply.status(404).send({ error: 'PRODUCT_NOT_FOUND' });
    await storeAnalyticsService.recordProductClick(creatorId, productId).catch((err) => request.log.warn({ err, creatorId, productId }, 'Store analytics click record failed'));
    return reply.status(204).send();
  });

  /** GET /shop/analytics — creator store dashboard (auth). Query: startDate, endDate (ISO; default last 30 days). */
  app.get('/shop/analytics', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isStorefrontEligible(user._id))) {
      return reply.status(403).send({
        error: 'STOREFRONT_RESTRICTED',
        message: 'Store analytics is available for storefront-enabled creators.',
      });
    }
    const { startDate, endDate } = request.query ?? {};
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return reply.status(400).send({ error: 'INVALID_DATE', message: 'startDate and endDate must be valid ISO dates' });
    }
    const result = await storeAnalyticsService.getStoreAnalytics(user._id, start, end);
    const revenueFormatted = result.revenueCents != null ? `$${(result.revenueCents / 100).toFixed(2)}` : '$0.00';
    return reply.send({
      storeViews: result.storeViews,
      productClicks: result.productClicks,
      conversionRate: result.conversionRate,
      topProducts: result.topProducts,
      revenueCents: result.revenueCents,
      revenue: revenueFormatted,
      orderCount: result.orderCount,
      startDate: result.startDate,
      endDate: result.endDate,
    });
  });

  /* Creator storefront — products */
  app.get('/shop/creator/:creatorId/products', async (request, reply) => {
    const { category, limit = 20, offset = 0 } = request.query ?? {};
    const filter = { creatorId: request.params.creatorId, status: 'active' };
    if (category) filter.category = category;

    const [products, total] = await Promise.all([
      db.Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .lean(),
      db.Product.countDocuments(filter),
    ]);
    return reply.send({ products, total, limit: Number(limit), offset: Number(offset) });
  });

  /* Creator storefront — auctions */
  app.get('/shop/creator/:creatorId/auctions', async (request, reply) => {
    const { status, limit = 20, offset = 0 } = request.query ?? {};
    const filter = { creatorId: request.params.creatorId };
    if (status) filter.status = status;
    else filter.status = { $in: ['live', 'upcoming'] };

    const [auctions, total] = await Promise.all([
      db.Auction.find(filter)
        .sort({ endsAt: 1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .lean(),
      db.Auction.countDocuments(filter),
    ]);
    return reply.send({ auctions, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── My orders ── */
  app.get('/shop/orders', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { status, limit = 20, offset = 0 } = request.query ?? {};
    const filter = { userId: user._id };
    if (status) filter.status = status;

    const [orders, total] = await Promise.all([
      db.Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .lean(),
      db.Order.countDocuments(filter),
    ]);

    return reply.send({ orders, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ══════════════════════════════════════
     AUCTIONS
  ══════════════════════════════════════ */

  /* Single auction */
  app.get('/shop/auctions/:id', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const auction = await db.Auction.findById(request.params.id).lean();
    if (!auction) return reply.status(404).send({ error: 'NOT_FOUND' });

    // Auto-end if past endsAt — set winner and 24h payment deadline (Phase 5)
    if (auction.status === 'live' && new Date(auction.endsAt) <= new Date()) {
      const deadline = nextAuctionPaymentDeadline();
      await db.Auction.findByIdAndUpdate(auction._id, {
        $set: {
          status: 'awaiting_payment',
          winnerId: auction.currentBidderId,
          winningBidCents: auction.currentBidCents,
          deadline,
        },
      });
      auction.status = 'awaiting_payment';
      auction.winnerId = auction.currentBidderId;
      auction.winningBidCents = auction.currentBidCents;
      auction.deadline = deadline;
    }
    return reply.send({ auction });
  });

  /* Create auction */
  app.post('/shop/auctions', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { title, description, imageUrl, startBidCents, reserveCents, endsAt, startsAt, productId, streamId } = request.body ?? {};
    if (!title?.trim())     return reply.status(400).send({ error: 'TITLE_REQUIRED' });
    if (title.trim().length > 200) return reply.status(400).send({ error: 'TITLE_TOO_LONG', message: 'Auction title must be 200 characters or fewer' });
    if (description && description.length > 5000) return reply.status(400).send({ error: 'DESCRIPTION_TOO_LONG', message: 'Auction description must be 5,000 characters or fewer' });
    if (!startBidCents)     return reply.status(400).send({ error: 'START_BID_REQUIRED' });
    if (!endsAt)            return reply.status(400).send({ error: 'ENDS_AT_REQUIRED' });

    const startBid = Number(startBidCents);
    if (!Number.isInteger(startBid) || startBid < 1) {
      return reply.status(400).send({ error: 'START_BID_MUST_BE_POSITIVE', message: 'startBidCents must be a positive integer (minimum 1 cent)' });
    }

    if (reserveCents !== undefined && reserveCents !== null) {
      const reserve = Number(reserveCents);
      if (!Number.isInteger(reserve) || reserve < 1) {
        return reply.status(400).send({ error: 'RESERVE_MUST_BE_POSITIVE', message: 'reserveCents must be a positive integer' });
      }
      if (reserve <= startBid) {
        return reply.status(400).send({ error: 'RESERVE_MUST_EXCEED_START_BID', message: 'reserveCents must be greater than startBidCents' });
      }
    }

    const endDate = new Date(endsAt);
    if (isNaN(endDate) || endDate <= new Date()) {
      return reply.status(400).send({ error: 'INVALID_ENDS_AT' });
    }

    const startDate = startsAt ? new Date(startsAt) : new Date();
    const status = startDate <= new Date() ? 'live' : 'upcoming';

    let streamIdValid = null;
    if (streamId) {
      if (!validateId(streamId, reply)) return;
      const stream = await db.LiveStream.findById(streamId).lean();
      if (!stream || String(stream.userId) !== String(user._id)) return reply.status(400).send({ error: 'INVALID_STREAM', message: 'streamId must be your own live stream' });
      streamIdValid = streamId;
    }

    const creatorReputationService = require('../services/creatorReputationService');
    if (!(await creatorReputationService.isAuctionEligible(user._id))) {
      return reply.status(403).send({
        error: 'AUCTION_RESTRICTED',
        message: 'Auction access is restricted by your creator reputation score. Please contact support.',
      });
    }

    try {
      await commerceIntegrity.assertSellerVerified(user._id);
    } catch (err) {
      if (
        err instanceof commerceIntegrity.SellerNotVerifiedError ||
        err instanceof commerceIntegrity.SellerBlockedError
      ) {
        return reply.status(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }

    const auction = await db.Auction.create({
      creatorId: user._id, title: title.trim(), description: description || '',
      imageUrl: imageUrl || '', startBidCents: startBid,
      reserveCents: reserveCents != null ? Number(reserveCents) : null,
      endsAt: endDate, startsAt: startDate, status, productId: productId || null,
      streamId: streamIdValid,
    });
    return reply.status(201).send({ auction: auction.toObject() });
  });

  /* Place a bid */
  app.post('/shop/auctions/:id/bid', { config: { rateLimit: BID_RATE_LIMIT } }, async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const { amountCents } = request.body ?? {};
    if (!amountCents) return reply.status(400).send({ error: 'AMOUNT_REQUIRED' });
    if (!Number.isInteger(Number(amountCents)) || Number(amountCents) < 1) {
      return reply.status(400).send({ error: 'INVALID_AMOUNT', message: 'amountCents must be a positive integer' });
    }

    const auction = await db.Auction.findById(request.params.id);
    if (!auction) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (auction.status !== 'live') return reply.status(400).send({ error: 'AUCTION_NOT_LIVE', status: auction.status });
    if (new Date(auction.endsAt) <= new Date()) {
      const deadline = nextAuctionPaymentDeadline();
      auction.status = 'awaiting_payment';
      auction.winnerId = auction.currentBidderId;
      auction.winningBidCents = auction.currentBidCents;
      auction.deadline = deadline;
      await auction.save();
      return reply.status(400).send({ error: 'AUCTION_ENDED' });
    }

    const bid = Number(amountCents);
    const minBidPre = (auction.currentBidCents ?? auction.startBidCents - 1) + 1;
    if (bid < minBidPre) {
      return reply.status(400).send({ error: 'BID_TOO_LOW', minBidCents: minBidPre });
    }

    const auctionIdStr = String(auction._id);
    let httpAbort = null;
    let responseBody = null;

    try {
      await withAuctionLock(auctionIdStr, async () => {
        const a0 = await db.Auction.findById(auctionIdStr);
        if (!a0 || a0.status !== 'live') {
          httpAbort = { status: 400, body: { error: 'AUCTION_NOT_LIVE', status: a0?.status } };
          return;
        }
        if (new Date(a0.endsAt) <= new Date()) {
          const deadline = nextAuctionPaymentDeadline();
          a0.status = 'awaiting_payment';
          a0.winnerId = a0.currentBidderId;
          a0.winningBidCents = a0.currentBidCents;
          a0.deadline = deadline;
          await a0.save();
          httpAbort = { status: 400, body: { error: 'AUCTION_ENDED' } };
          return;
        }

        const walletIds = [String(user._id)];
        if (a0.currentBidderId && String(a0.currentBidderId) !== String(user._id)) {
          walletIds.push(String(a0.currentBidderId));
        }

        await withOrderedWalletLocks(walletIds, async () => {
          const auctionLocked = await db.Auction.findById(auctionIdStr);
          if (!auctionLocked || auctionLocked.status !== 'live') {
            httpAbort = { status: 400, body: { error: 'AUCTION_NOT_LIVE', status: auctionLocked?.status } };
            return;
          }
          if (new Date(auctionLocked.endsAt) <= new Date()) {
            httpAbort = { status: 400, body: { error: 'AUCTION_ENDED' } };
            return;
          }

          const minBid = (auctionLocked.currentBidCents ?? auctionLocked.startBidCents - 1) + 1;
          if (bid < minBid) {
            httpAbort = { status: 400, body: { error: 'BID_TOO_LOW', minBidCents: minBid } };
            return;
          }

          const bidderWallet = await db.Wallet.findOne({ userId: user._id });
          if (!bidderWallet) {
            httpAbort = { status: 400, body: { error: 'NO_WALLET' } };
            return;
          }
          if (bidderWallet.balanceCents < bid) {
            httpAbort = {
              status: 402,
              body: { error: 'INSUFFICIENT_COINS', balance: bidderWallet.balanceCents, required: bid },
            };
            return;
          }

          const prevBidderId = auctionLocked.currentBidderId;
          const prevBidCents = auctionLocked.currentBidCents ?? 0;
          if (prevBidderId && prevBidderId.toString() !== user._id.toString() && prevBidCents > 0) {
            await db.Wallet.findOneAndUpdate(
              { userId: prevBidderId },
              { $inc: { balanceCents: prevBidCents } },
            );
            await appendEntry({
              type: 'refund',
              actorId: prevBidderId,
              amountCents: prevBidCents,
              refType: 'auction_refund',
              refId: String(auctionLocked._id),
              meta: { auctionId: String(auctionLocked._id), reason: 'outbid' },
            }).catch((err) => request.log.error({ err }, 'Failed to write outbid refund ledger entry'));
          }

          bidderWallet.balanceCents -= bid;
          await bidderWallet.save();
          await appendEntry({
            type: 'bid_hold',
            actorId: user._id,
            amountCents: -bid,
            refType: 'auction_bid',
            refId: String(auctionLocked._id),
            meta: { auctionId: String(auctionLocked._id) },
          }).catch((err) => request.log.error({ err }, 'Failed to write bid_hold ledger entry'));

          const profile = await db.Profile.findOne({ userId: user._id }).lean().catch(() => null);
          const displayName = profile?.displayName || user.email?.split('@')[0] || 'Bidder';

          auctionLocked.bids.push({ bidderId: user._id, amountCents: bid, displayName });
          auctionLocked.currentBidCents = bid;
          auctionLocked.currentBidderId = user._id;
          await auctionLocked.save();

          const bidPayload = {
            type: 'bid',
            auction: auctionLocked.toObject(),
            bid: { bidderId: String(user._id), displayName, amountCents: bid, ts: Date.now() },
          };
          getBroadcastToAuction()(String(auctionLocked._id), bidPayload);
          if (auctionLocked.streamId) {
            getBroadcastToStream()(String(auctionLocked.streamId), { type: 'new_bid', ...bidPayload });
          }

          await notifyUser(auctionLocked.creatorId, {
            type: 'bid',
            title: 'New bid on your auction!',
            body: `${displayName} bid $${(bid / 100).toFixed(2)} on "${auctionLocked.title}"`,
            meta: { auctionId: String(auctionLocked._id), bidderId: String(user._id), amountCents: bid },
          }).catch(() => null);
          trackEvent({
            name: 'auction.bid_placed',
            userId: String(user._id),
            props: {
              auctionId: String(auctionLocked._id),
              creatorId: String(auctionLocked.creatorId),
              amountCents: bid,
              streamId: auctionLocked.streamId ? String(auctionLocked.streamId) : null,
            },
          }).catch(() => {});

          responseBody = { ok: true, currentBidCents: bid, auction: auctionLocked.toObject() };
        });
      });
    } catch (err) {
      if (err instanceof LockContentionError) {
        return reply.status(409).send({ error: err.code || 'REDIS_LOCK_HELD', message: err.message });
      }
      throw err;
    }

    if (httpAbort) return reply.status(httpAbort.status).send(httpAbort.body);
    return reply.send(responseBody);
  });

  /* End auction early (creator only) */
  app.post('/shop/auctions/:id/end', async (request, reply) => {
    if (!validateId(request.params.id, reply)) return;
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });

    const auctionIdStr = String(request.params.id);
    const auctionPre = await db.Auction.findById(auctionIdStr);
    if (!auctionPre) return reply.status(404).send({ error: 'NOT_FOUND' });
    if (auctionPre.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    if (user.role !== 'admin') {
      try {
        await commerceIntegrity.assertSellerVerified(user._id);
      } catch (err) {
        if (
          err instanceof commerceIntegrity.SellerNotVerifiedError ||
          err instanceof commerceIntegrity.SellerBlockedError
        ) {
          return reply.status(err.statusCode).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    }

    let httpAbort = null;
    let endedAuctionDoc = null;
    let walletCreditFailed = false;

    try {
      await withAuctionLock(auctionIdStr, async () => {
        const creatorIdStr = String(auctionPre.creatorId);
        await withWalletLock(creatorIdStr, async () => {
          const auction = await db.Auction.findById(auctionIdStr);
          if (!auction) {
            httpAbort = { status: 404, body: { error: 'NOT_FOUND' } };
            return;
          }
          if (auction.creatorId.toString() !== user._id.toString() && user.role !== 'admin') {
            httpAbort = { status: 403, body: { error: 'FORBIDDEN' } };
            return;
          }

          auction.status = 'ended';
          auction.endsAt = new Date();
          auction.winnerId = auction.currentBidderId;
          auction.winningBidCents = auction.currentBidCents;
          await auction.save();

          const endPayload = { type: 'auction_ended', auction: auction.toObject() };
          getBroadcastToAuction()(String(auction._id), endPayload);
          if (auction.streamId) {
            getBroadcastToStream()(String(auction.streamId), endPayload);
          }

          if (auction.currentBidderId && auction.currentBidCents > 0) {
            try {
              await db.Wallet.findOneAndUpdate(
                { userId: auction.creatorId },
                { $inc: { balanceCents: auction.currentBidCents } },
                { upsert: true },
              );
            } catch (walletErr) {
              request.log.error(
                { err: walletErr, auctionId: String(auction._id), creatorId: String(auction.creatorId), amountCents: auction.currentBidCents },
                'CRITICAL: failed to credit creator wallet on auction end — manual reconciliation required'
              );
              walletCreditFailed = true;
              return;
            }
            appendEntry({
              type: 'credit',
              actorId: auction.creatorId,
              amountCents: auction.currentBidCents,
              refType: 'auction_win',
              refId: String(auction._id),
              meta: { auctionId: String(auction._id), winnerId: String(auction.currentBidderId), source: 'auction_win' },
            }).catch((err) => request.log.error({ err, auctionId: String(auction._id) }, 'Failed to write auction_win credit ledger entry'));
            appendEntry({
              type: 'debit',
              actorId: auction.currentBidderId,
              amountCents: -auction.currentBidCents,
              refType: 'auction_win_settlement',
              refId: String(auction._id),
              meta: { auctionId: String(auction._id), creatorId: String(auction.creatorId), source: 'auction_win_settlement' },
            }).catch((err) => request.log.error({ err, auctionId: String(auction._id) }, 'Failed to write auction_win debit ledger entry'));
          }

          endedAuctionDoc = auction;
        });
      });
    } catch (err) {
      if (err instanceof LockContentionError) {
        return reply.status(409).send({ error: err.code || 'REDIS_LOCK_HELD', message: err.message });
      }
      throw err;
    }

    if (httpAbort) return reply.status(httpAbort.status).send(httpAbort.body);
    if (walletCreditFailed) {
      return reply.status(500).send({ error: 'WALLET_CREDIT_FAILED', message: 'Auction ended but creator wallet credit failed' });
    }
    return reply.send({ ok: true, auction: endedAuctionDoc.toObject() });
  });
}

module.exports = { shopRoutes };
