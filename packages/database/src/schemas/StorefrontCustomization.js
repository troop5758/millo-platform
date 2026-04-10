'use strict';
/**
 * StorefrontCustomization — per-creator storefront layout theme, config, brand identity, and section order.
 * storeLayout: drag-and-drop section order (hero_banner, featured_products, product_grid, etc.).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const LAYOUT_THEMES = ['grid_store', 'creator_brand', 'live_seller', 'auction_house'];
const BACKGROUND_THEMES = ['light', 'dark'];

/** Section types for storeLayout (landing-page style builder). Each item: { type, title?, limit?, ... }. */
const STORE_SECTION_TYPES = [
  'hero_banner',
  'featured_products',
  'product_grid',
  'collections',
  'live_stream',
  'upcoming_auctions',
  'creator_video',
  'reviews',
];

const storeSectionSchema = new mongoose.Schema(
  {
    type:   { type: String, enum: STORE_SECTION_TYPES, required: true },
    title:  { type: String, trim: true, maxlength: 120 },
    limit:  { type: Number, min: 1, max: 50 },
    meta:   { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const storefrontThemeSchema = new mongoose.Schema(
  {
    bannerUrl:       { type: String, trim: true, maxlength: 2048 },
    logoUrl:         { type: String, trim: true, maxlength: 2048 },
    accentColor:     { type: String, trim: true, maxlength: 32 },
    backgroundTheme: { type: String, enum: BACKGROUND_THEMES, default: 'light' },
    backgroundColor: { type: String, trim: true, maxlength: 32 },
    fontFamily:      { type: String, trim: true, maxlength: 128 },
    description:     { type: String, trim: true, maxlength: 2000 },
  },
  { _id: false }
);

/** Product collection (category): name, description, productIds. */
const storeCollectionSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    productIds:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  },
  { _id: true }
);

/** Creator promo video at the top of the store (e.g. "Welcome to my store! Watch my video → buy products"). */
const promoVideoSchema = new mongoose.Schema(
  {
    videoUrl:     { type: String, trim: true, maxlength: 2048 },
    title:       { type: String, trim: true, maxlength: 200 },
    thumbnailUrl: { type: String, trim: true, maxlength: 2048 },
    ctaText:     { type: String, trim: true, maxlength: 120 },
  },
  { _id: false }
);

/** Store ratings & trust badges for buyer confidence (e.g. ✔ Verified Seller, ✔ Fast Shipping, ✔ Top Creator, 5⭐). */
const storeMetricsSchema = new mongoose.Schema(
  {
    rating:         { type: Number, min: 0, max: 5, default: null },
    reviewCount:    { type: Number, min: 0, default: 0 },
    verifiedSeller: { type: Boolean, default: false },
    fastShipping:   { type: Boolean, default: false },
    topCreator:     { type: Boolean, default: false },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    creatorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    /** Unique URL slug for storefront: milloapp.com/store/:storeSlug or milloapp.com/@:storeSlug/store. Lowercase, [a-z0-9_-], 2-64 chars. */
    storeSlug:    { type: String, trim: true, lowercase: true, minlength: 2, maxlength: 64, sparse: true, index: true },
    /** Store moderation: when true, storefront is hidden and seller cannot list/sell. Set by admin. */
    storeSuspended:    { type: Boolean, default: false, index: true },
    storeSuspendedAt:  { type: Date, default: null },
    storeSuspendedReason: { type: String, trim: true, maxlength: 500, default: null },
    storeSuspendedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    layoutTheme:  { type: String, enum: LAYOUT_THEMES, default: 'grid_store', index: true },
    /** Theme-specific config. Keys depend on layout:
     * grid_store: showFilters, showCategories, categoryOrder[]
     * creator_brand: bannerImageUrl, featuredProductIds[], collectionNames[] (or category labels)
     * live_seller: pinnedLiveStreamId (optional), showProductsUnderLive
     * auction_house: featuredAuctionIds[], showCountdown
     */
    config:       { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Brand identity: store banner, logo, accent color, background (light/dark), font, store description. */
    storefrontTheme: { type: storefrontThemeSchema, default: () => ({}) },
    /** Drag-and-drop section order. Order of array = order on storefront. */
    storeLayout:     [{ type: storeSectionSchema }],
    /** Pinned products shown at the top of the store (e.g. ⭐ Featured). Order = display order. */
    featuredProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    /** Product collections (categories): name, description, productIds. Order of array = display order. */
    collections:      [{ type: storeCollectionSchema }],
    /** Promo video at the top of the store (watch video → buy products; increases conversions). */
    promoVideo:        { type: promoVideoSchema, default: undefined },
    /** Store ratings & trust badges: rating (0-5), reviewCount, verifiedSeller, fastShipping, topCreator. */
    storeMetrics:      { type: storeMetricsSchema, default: () => ({}) },
    meta:         { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const MAX_FEATURED_PRODUCTS = 12;
const MAX_COLLECTIONS = 20;
const MAX_PRODUCTS_PER_COLLECTION = 100;

schema.index({ creatorId: 1 });
schema.index({ storeSlug: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StorefrontCustomization', schema);
module.exports.LAYOUT_THEMES = LAYOUT_THEMES;
module.exports.BACKGROUND_THEMES = BACKGROUND_THEMES;
module.exports.STORE_SECTION_TYPES = STORE_SECTION_TYPES;
module.exports.MAX_FEATURED_PRODUCTS = MAX_FEATURED_PRODUCTS;
module.exports.MAX_COLLECTIONS = MAX_COLLECTIONS;
module.exports.MAX_PRODUCTS_PER_COLLECTION = MAX_PRODUCTS_PER_COLLECTION;
