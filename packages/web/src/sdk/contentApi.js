/**
 * Content SDK — streams, feed, search, creator profiles, notifications, analytics.
 * Falls back to mock data when API is unreachable (dev without backend).
 * https://milloapp.com
 */
import { getToken } from './authApi';
import { API_BASE } from '../config/api.js';
import { sendBehavior } from '../lib/behavior.js';

const BASE = API_BASE;

function authHeaders() {
  const token = getToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/** Flush behavior SDK before money movement (coin pack, checkout, payouts, creator subs). */
async function postPayment(path, body) {
  await sendBehavior().catch(() => {});
  return post(path, body);
}
async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}
async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

/* ── Streams ── */
export async function fetchStreams(filter = 'all') {
  const data = await get(`/content/streams?filter=${filter}`);
  return data;
}

/* ── Feed ── */
export async function fetchFeed(tab = 'foryou', category = 'all', limit = 20, offset = 0) {
  const data = await get(`/content/feed?tab=${tab}&category=${category}&limit=${limit}&offset=${offset}`);
  return data;
}

/**
 * Discovery For You (`GET /api/feed`) — canonical contract: items + cursor + hasMore; optional `X-Session-Events` for ranking boosts.
 * @param {number|{ limit?: number, cursor?: string|null, recentEvents?: Array<{ eventType?: string, topic?: string, type?: string }> }} [limitOrParams]
 * @param {{ recentEvents?: Array<{ eventType?: string, topic?: string, type?: string }> }} [legacyOptions] — used only when first arg is a number
 */
export async function fetchDiscoveryForYou(limitOrParams = 20, legacyOptions = {}) {
  let limit = 20;
  let recentEvents;
  let cursor;
  if (limitOrParams != null && typeof limitOrParams === 'object' && !Array.isArray(limitOrParams)) {
    const p = limitOrParams;
    limit = Number(p.limit) || 20;
    recentEvents = p.recentEvents;
    cursor = p.cursor;
  } else {
    limit = Number(limitOrParams) || 20;
    recentEvents = legacyOptions.recentEvents;
    cursor = legacyOptions.cursor;
  }
  limit = Math.min(100, Math.max(1, limit));
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', String(cursor));
  const headers = { ...authHeaders() };
  if (Array.isArray(recentEvents) && recentEvents.length) {
    headers['X-Session-Events'] = JSON.stringify(recentEvents.slice(-50));
  }
  const res = await fetch(`${BASE}/api/feed?${params}`, { headers });
  if (!res.ok) {
    const err = new Error(`API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (data && typeof data === 'object') {
    const nextCursor = data.nextCursor ?? data.cursor ?? null;
    const hasMore = 'hasMore' in data ? Boolean(data.hasMore) : Boolean(nextCursor);
    return {
      ...data,
      nextCursor,
      cursor: nextCursor,
      hasMore,
    };
  }
  return data;
}

/** POST /feed/events/* — persist + Kafka (see docs/feed-reference-stack.md). */
export async function trackFeedImpression(payload = {}) {
  return post('/feed/events/impression', payload);
}
export async function trackFeedWatch(payload = {}) {
  return post('/feed/events/watch', payload);
}
export async function trackFeedEngagement(payload = {}) {
  return post('/feed/events/engagement', payload);
}
export async function trackFeedNegative(payload = {}) {
  return post('/feed/events/negative', payload);
}

/** Granular trackers → Millo aggregate `watch` / `engagement` endpoints. */
export async function trackFeedWatchStart(payload = {}) {
  return post('/feed/events/watch', { ...payload, eventType: 'play' });
}
export async function trackFeedWatchProgress(payload = {}) {
  const sec = Number(payload.progressSeconds) || 0;
  let eventType = 'watch_2s';
  if (sec >= 15) eventType = 'watch_15s';
  else if (sec >= 6) eventType = 'watch_6s';
  return post('/feed/events/watch', {
    ...payload,
    eventType,
    watchTimeMs: Math.round(sec * 1000),
  });
}
export async function trackFeedWatchComplete(payload = {}) {
  return post('/feed/events/watch', { ...payload, eventType: 'complete' });
}
export async function trackFeedLike(payload = {}) {
  return post('/feed/events/engagement', { ...payload, eventType: 'like' });
}
export async function trackFeedShare(payload = {}) {
  return post('/feed/events/engagement', { ...payload, eventType: 'share' });
}
export async function trackFeedCommentOpen(payload = {}) {
  return post('/feed/events/engagement', { ...payload, eventType: 'comment' });
}

/* ── Search ── */
export async function search(q, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  params.set('q', (q || '').trim());
  const data = await get(`/content/search?${params}`);
  return data;
}
export async function searchAdvanced({ q, type = 'all', category, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ type, limit: String(limit), offset: String(offset) });
  params.set('q', (q || '').trim());
  if (category && category !== 'all') params.set('category', category);
  const data = await get(`/content/search?${params}`);
  return data;
}

/* ── Creator profile ── */
export async function fetchCreator(id) {
  const data = await get(`/content/creators/${id}`);
  return data.creator;
}

/** Creator directory — GET /content/creators/discover */
export async function fetchCreatorsDiscover({
  sort = 'trending',
  category,
  live,
  country,
  limit = 24,
  offset = 0,
} = {}) {
  const params = new URLSearchParams({ sort, limit: String(limit), offset: String(offset) });
  if (category && category !== 'all') params.set('category', category);
  if (live) params.set('live', '1');
  if (country) params.set('country', country);
  return get(`/content/creators/discover?${params}`);
}

/* ── Update profile ── */
export async function updateProfile(fields) {
  const data = await put('/content/profile', fields);
  return data.profile;
}

/* ── Follow / Unfollow ── */
export async function followUser(userId) {
  return post(`/profile/follow/${userId}`, {});
}
export async function unfollowUser(userId) {
  return del(`/profile/follow/${userId}`);
}

/* ── Check follow status ── */
export async function checkFollowing(userId) {
  try {
    const data = await get(`/profile/${userId}/followers`);
    return data; // caller inspects list
  } catch { return { followers: [] }; }
}

/* ── Gift send (coin deduction) ── */
export async function sendGift(receiverId, giftId, coins, streamId = null, fingerprint = null) {
  const body = {
    receiverId,
    giftId,
    coins,
    streamId,
    timestamp: Date.now(),
    nonce: typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : null,
  };
  if (fingerprint) body.fingerprint = fingerprint;
  return post('/content/gifts/send', body);
}

/* ── Wallet balance ── */
export async function fetchWallet() {
  const data = await get('/content/wallet');
  return data.wallet;
}

/* ── Wallet transactions (ledger entries) ── */
export async function fetchWalletTransactions(limit = 30) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const query = params.toString() ? `?${params}` : '';
  const data = await get(`/payments/wallet/transactions${query}`);
  return data.transactions || [];
}

/* ── DM conversations ── */
export async function fetchConversations() {
  const data = await get('/dm/conversations');
  return data.conversations || [];
}
export async function fetchMessages(userId, limit = 50) {
  const data = await get(`/dm/conversation/${userId}/messages?limit=${limit}`);
  return data.messages || [];
}
export async function sendMessage(receiverId, body) {
  return post('/dm/messages', { receiverId, body });
}
export async function deleteMessage(messageId) {
  return del(`/dm/messages/${messageId}`);
}

/* ── Notifications ── */
export async function fetchNotifications(unreadOnly = false) {
  const data = await get(`/content/notifications${unreadOnly ? '?unreadOnly=true' : ''}`);
  return data;
}
export async function fetchNotificationsPage({ filter = 'all', page = 1, limit = 20 } = {}) {
  const params = new URLSearchParams({ limit, page });
  if (filter && filter !== 'all') params.set('type', filter);
  const data = await get(`/content/notifications?${params}`);
  return data;
}

export async function markNotificationsRead(ids) {
  return post('/content/notifications/read', ids ? { ids } : {});
}

/* ── Analytics ── */
export async function fetchMyAnalytics() {
  const data = await get('/content/analytics/me');
  return data.analytics;
}

/* ── Payments ── */
export async function createCoinIntent(packId, country, deviceFingerprint = null) {
  const body = { packId, country };
  if (deviceFingerprint) body.deviceFingerprint = deviceFingerprint;
  return postPayment('/payments/coins/intent', body);
}
export async function createCoinCheckoutSession(packId, country, deviceFingerprint = null) {
  const body = { packId, country };
  if (deviceFingerprint) body.deviceFingerprint = deviceFingerprint;
  return postPayment('/payments/coins/checkout-session', body);
}
export async function confirmCoinPurchase(paymentIntentId, packId, stubMode = false) {
  return postPayment('/payments/coins/confirm', { paymentIntentId, packId, stubMode });
}
export async function createSubscriptionCheckout(tierId, annual = false, deviceFingerprint = null) {
  const body = { tierId, annual };
  if (deviceFingerprint) body.deviceFingerprint = deviceFingerprint;
  return postPayment('/payments/subscriptions/create', body);
}
export async function fetchMySubscriptions() {
  const data = await get('/payments/subscriptions/my');
  return data.subscriptions || [];
}
export async function cancelSubscription(subscriptionId) {
  return post('/payments/subscriptions/cancel', subscriptionId ? { subscriptionId } : {});
}
export async function requestPayout(amountCents, provider = 'stripe', destination = null) {
  return postPayment('/payments/payouts/request', { amountCents, provider, destination });
}
export async function fetchPayoutHistory() {
  const data = await get('/payments/payouts/history');
  return data.payouts || [];
}

/** GET /compliance/creator/payout-requirements — KYC / tax checklist for creator payouts. */
export async function fetchCreatorPayoutRequirements() {
  return get('/compliance/creator/payout-requirements');
}

/* ── Shop ── */
/** Fetch authenticated user's orders. */
export async function fetchOrders(limit = 20, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const data = await get(`/shop/orders?${params}`);
  return data.orders || [];
}

export async function fetchCreatorProducts(creatorId, category = null) {
  const q = category ? `?category=${encodeURIComponent(category)}` : '';
  const data = await get(`/shop/creator/${creatorId}/products${q}`);
  return data.products || [];
}
export async function fetchProduct(id) {
  const data = await get(`/shop/products/${id}`);
  return data.product;
}
export async function createProduct(fields) {
  return post('/shop/products', fields);
}
export async function fetchCreatorAuctions(creatorId, status = null) {
  const q = status ? `?status=${status}` : '';
  const data = await get(`/shop/creator/${creatorId}/auctions${q}`);
  return data.auctions || [];
}
export async function fetchAuction(id) {
  const data = await get(`/shop/auctions/${id}`);
  return data.auction;
}
export async function placeBid(auctionId, amountCents) {
  return postPayment(`/shop/auctions/${auctionId}/bid`, { amountCents });
}
export async function createAuction(fields) {
  return post('/shop/auctions', fields);
}
export async function endAuction(auctionId) {
  return post(`/shop/auctions/${auctionId}/end`, {});
}
export async function fetchAuctions(status = null, limit = 30, offset = 0) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (status) params.set('status', status);
  const data = await get(`/shop/auctions?${params}`);
  return data.auctions || [];
}
export async function fetchFeaturedProducts(limit = 4, sort = 'popular') {
  const params = new URLSearchParams({ limit: String(limit), sort });
  const data = await get(`/shop/products?${params}`);
  return data.products || [];
}

/* ── VOD / Replays ── */
export async function fetchVODs({ creatorId, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (creatorId) params.set('creatorId', creatorId);
  const data = await get(`/content/vod?${params}`);
  return data;
}
export async function fetchVOD(id) {
  const data = await get(`/content/vod/${id}`);
  return data;
}

/* ── Live streams ── */
export async function fetchStream(id) {
  const data = await get(`/content/streams/${id}`);
  return data;
}
/** Fetch chat history for a live stream. */
export async function fetchStreamChat(streamId, limit = 50) {
  const data = await get(`/live/stream/${streamId}/chat?limit=${limit}`);
  return data.messages || [];
}

/** Fetch device analytics for a stream (creator only). */
export async function fetchStreamDeviceAnalytics(streamId, limit = 500) {
  return get(`/live/stream/${streamId}/device-analytics?limit=${limit}`);
}

/** Request to join a live stream as co-host. Broadcasts cohost_request to stream room. */
export async function requestCohost(streamId) {
  return post(`/live/stream/${streamId}/cohost/request`, {});
}

/** Generate AI (MILLA) reply to a chat message. Requires MILLA_ENABLED. */
export async function generateAiChatReply(message, { streamId, systemPrompt } = {}) {
  return post('/live/milla/chat/reply', { message, streamId, systemPrompt });
}
export async function startStream(title, visibility, priceCents) {
  return post('/content/streams/start', { title, visibility, priceCents });
}
export async function stopStream(streamId) {
  return post(`/content/streams/${streamId}/stop`, {});
}
/** Fetch a single live event by ID. */
export async function fetchEvent(eventId) {
  const data = await get(`/live/events/${eventId}`);
  return data;
}

/** Fetch event chat messages. */
export async function fetchEventChat(eventId, { limit = 50, before } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  const data = await get(`/live/events/${eventId}/chat?${params}`);
  return data.messages || [];
}

/** Send event chat message. */
export async function sendEventChat(eventId, text) {
  const data = await post(`/live/events/${eventId}/chat`, { text });
  return data;
}

/** Fetch upcoming live events. */
export async function fetchUpcomingEvents({ limit = 50, creatorId } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (creatorId) params.set('creatorId', creatorId);
  const data = await get(`/live/events/upcoming?${params}`);
  return Array.isArray(data) ? data : data.events || [];
}

/** Complete event and set replay URL (creator only). */
export async function completeEvent(eventId, { status = 'completed', replayUrl } = {}) {
  return patch(`/live/events/${eventId}`, { status, replayUrl });
}

/** Fetch event replays (completed events with replayUrl). */
export async function fetchEventReplays({ creatorId, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (creatorId) params.set('creatorId', creatorId);
  const data = await get(`/live/events/replays?${params}`);
  return data;
}

/** Fetch upcoming scheduled streams. */
export async function fetchUpcomingScheduled({ limit = 20, creatorId } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (creatorId) params.set('creatorId', creatorId);
  const data = await get(`/live/scheduled/upcoming?${params}`);
  return Array.isArray(data) ? data : data.streams || [];
}

/** Get calendar export URL for a scheduled stream. format: google | ical | outlook */
export function getScheduledStreamCalendarUrl(scheduledStreamId, format = 'google') {
  return `${API_BASE}/live/scheduled/${scheduledStreamId}/calendar?format=${format}`;
}

/** Schedule a live stream for a future time. */
export async function scheduleStream({ title, description, thumbnailUrl, scheduledStart, streamType, priceCents, notifyFollowers }) {
  return post('/live/schedule', {
    title,
    description,
    thumbnailUrl,
    scheduled_start: scheduledStart,
    stream_type: streamType,
    price: priceCents,
    notifyFollowers,
  });
}

/* ── Video engagement (like, comment, save, share) ── */
export async function likeVideo(videoId) {
  return post(`/content/streams/${videoId}/like`, {});
}
export async function unlikeVideo(videoId) {
  return del(`/content/streams/${videoId}/like`);
}
export async function saveVideo(videoId) {
  return post(`/content/streams/${videoId}/save`, {});
}
export async function unsaveVideo(videoId) {
  return del(`/content/streams/${videoId}/save`);
}
export async function shareVideo(videoId, platform) {
  return post(`/content/streams/${videoId}/share`, { platform: platform || null });
}
export async function addCommentVideo(videoId, text) {
  return post(`/content/streams/${videoId}/comments`, { text });
}
export async function fetchVideoComments(videoId, limit = 50) {
  const data = await get(`/content/streams/${videoId}/comments?limit=${limit}`);
  return data.comments || [];
}
export async function fetchVideoEngagement(videoId) {
  const data = await get(`/content/streams/${videoId}/engagement`);
  return data;
}

/* ── Shop the look (video products) ── */
export async function fetchVideoProducts(videoId) {
  const data = await get(`/content/streams/${videoId}/products`);
  return data.products || [];
}
/** Start auction during live stream (creator only). */
export async function startStreamAuction(streamId, { productId, startingPrice }) {
  return post(`/live/stream/${streamId}/start-auction`, { productId, startingPrice });
}

/** Trigger product drop during live stream (creator only). */
export async function triggerProductDrop(streamId, { productId, price, quantity }) {
  return post(`/live/stream/${streamId}/product-drop`, { productId, price, quantity });
}

export async function addVideoProduct(videoId, productId, position) {
  return post(`/content/streams/${videoId}/products`, { productId, position });
}
export async function removeVideoProduct(videoId, productId) {
  return del(`/content/streams/${videoId}/products/${productId}`);
}

/* ── Live auction for stream overlay ── */
export async function fetchStreamLiveAuction(streamId) {
  const data = await get(`/content/streams/${streamId}/live-auction`);
  return data.auction;
}

/* ── DM utilities ── */
export async function markConversationRead(userId) {
  return post(`/dm/read/${userId}`, {});
}

/* ── Paid calls (DM monetization) ── */
export async function fetchCallsConfig() {
  const data = await get('/dm/calls/config');
  return data;
}
export async function requestCall(creatorId) {
  const data = await post('/dm/calls/request', { creatorId });
  return data;
}
export async function fetchCallSessions(limit = 30, offset = 0) {
  const data = await get(`/dm/calls/sessions?limit=${limit}&offset=${offset}`);
  return data;
}
export async function endCall(sessionId) {
  const data = await post(`/dm/calls/${sessionId}/end`, {});
  return data;
}
export async function approveCall(sessionId) {
  const data = await post(`/dm/calls/${sessionId}/approve`, {});
  return data;
}

/* ── Creator application ── */
export async function fetchCreatorApplication() {
  try {
    const data = await get('/creators/application/me');
    return data;
  } catch { return null; }
}
export async function applyAsCreator(fields) {
  return post('/creators/apply', fields);
}

/* ── Auth utilities ── */
export async function verifyEmail(token) {
  const res = await fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || data.error || 'Verification failed'), { data, status: res.status });
  return data;
}
export async function resendVerificationEmail() {
  return post('/auth/resend-verification', {});
}

/* ── Shop checkout ── */
export async function shopCheckoutPreview(cart, shippingInfo) {
  const items = Array.isArray(cart) ? cart.map((i) => ({ productId: i.productId ?? i.id, qty: i.qty ?? 1 })) : [];
  return postPayment('/payments/shop/checkout-preview', { items, shipping: shippingInfo });
}
export async function shopCheckout(cart, shippingInfo, deviceFingerprint = null) {
  const items = Array.isArray(cart) ? cart.map((i) => ({ productId: i.productId ?? i.id, qty: i.qty ?? 1 })) : [];
  const body = { items, shipping: shippingInfo };
  if (deviceFingerprint) body.deviceFingerprint = deviceFingerprint;
  return postPayment('/payments/shop/checkout', body);
}

/* ── Buy Now — single-product checkout (skips cart) ── */
export async function shopBuyNow(productId, qty = 1, deviceFingerprint = null) {
  const body = { productId, qty };
  if (deviceFingerprint) body.deviceFingerprint = deviceFingerprint;
  return postPayment('/payments/shop/buy-now', body);
}

/* ── Creator dashboard ── */
export async function fetchCreatorDashboard() {
  const data = await get('/dashboards/creator');
  return data;
}
export async function fetchAnalyticsRaw() {
  return get('/content/analytics/me');
}

/* ── Ads / Campaigns ── */
export async function fetchAdsCampaigns(limit = 20) {
  const data = await get(`/ads/campaigns?limit=${limit}`);
  return data;
}
export async function createAdCampaign(fields) {
  return post('/ads/campaigns', fields);
}
export async function fetchSubscriptionTiers(creatorId) {
  const data = await get(`/payments/subscriptions/tiers/${creatorId}`);
  return data.tiers || [];
}
export async function subscribeToCreator(creatorId) {
  return postPayment('/payments/subscriptions/creator', { creatorId });
}
export async function fetchSubscriptionStatus(creatorId) {
  const data = await get(`/payments/subscriptions/status/${creatorId}`);
  return data;
}
export async function blockUser(userId) {
  return post(`/profile/block/${userId}`, {});
}
export async function unblockUser(userId) {
  return del(`/profile/block/${userId}`);
}
export async function reportContent(targetId, targetType, reason, details) {
  return post('/moderation/report', { targetId, targetType, reason, details });
}

/** Report a short video. */
export async function reportShort(videoId, reason, description = '') {
  return post(`/content/streams/${encodeURIComponent(videoId)}/report`, { reason, description });
}

/** Fetch gift catalog with type (2d, 3d, ai). */
export async function fetchGifts() {
  const data = await get('/content/gifts');
  return data.gifts || [];
}

/** Fetch AI-recommended gift for current user. */
export async function fetchGiftRecommendation() {
  const data = await get('/content/gifts/recommend');
  return data.giftId || 'rose';
}

/* ── Notifications (extended) ── */
export async function fetchUnreadCount() {
  const data = await get('/notifications/unread-count');
  return data.count ?? 0;
}
export async function markNotificationRead(notificationId) {
  return post(`/notifications/${encodeURIComponent(notificationId)}/read`, {});
}
export async function registerPushToken(token, platform = 'expo') {
  return post('/notifications/push-token', { token, platform });
}
export async function unregisterPushToken(token) {
  return del(`/notifications/push-token?token=${encodeURIComponent(token)}`);
}

/* ── DM (extended) ── */
export async function sendTypingIndicator(receiverId) {
  return post('/dm/typing', { receiverId });
}
export async function fetchBlockedUsers() {
  const data = await get('/dm/blocked');
  return data.blocked || [];
}
/** Fetch blocked users with display names (uses /profile/blocked). */
export async function fetchBlockedUsersWithProfiles() {
  const data = await get('/profile/blocked');
  return data.blocked || [];
}
export async function isUserBlocked(userId) {
  try {
    const data = await get(`/dm/blocked/${encodeURIComponent(userId)}`);
    return data.blocked ?? false;
  } catch { return false; }
}

/* ── Profile (extended) ── */
export async function updateProfileMe(fields) {
  return patch('/profile/me', fields);
}
export async function fetchFollowers(userId, limit = 20, offset = 0) {
  const data = await get(`/profile/${encodeURIComponent(userId)}/followers?limit=${limit}&offset=${offset}`);
  return data;
}
export async function fetchFollowing(userId, limit = 20, offset = 0) {
  const data = await get(`/profile/${encodeURIComponent(userId)}/following?limit=${limit}&offset=${offset}`);
  return data;
}

/** Fetch profile activity feed (follow, video_upload, purchase, gift_sent, live_started). */
export async function fetchProfileActivity(userId, limit = 50, offset = 0) {
  const data = await get(`/profile/${encodeURIComponent(userId)}/activity?limit=${limit}&offset=${offset}`);
  return data.activity || [];
}

/* ── TV pairing ── */
export async function tvCreatePairingCode() {
  const data = await post('/tv/pairing/code', {});
  return data;
}
export async function tvGetPairedDevices() {
  const data = await get('/tv/devices');
  return Array.isArray(data) ? data : (data.devices || []);
}

/* ── Shop (extended) ── */
export async function updateProduct(productId, fields) {
  return put(`/shop/products/${encodeURIComponent(productId)}`, fields);
}
export async function deleteProduct(productId) {
  return del(`/shop/products/${encodeURIComponent(productId)}`);
}

/* ── Ads (extended) ── */
export async function fetchAdCampaign(id) {
  const data = await get(`/ads/campaigns/${encodeURIComponent(id)}`);
  return data;
}
export async function updateAdCampaign(id, fields) {
  return put(`/ads/campaigns/${encodeURIComponent(id)}`, fields);
}
export async function deleteAdCampaign(id) {
  return del(`/ads/campaigns/${encodeURIComponent(id)}`);
}
export async function fetchCampaignAds(campaignId) {
  const data = await get(`/ads/campaigns/${encodeURIComponent(campaignId)}/ads`);
  return data;
}
export async function createCampaignAd(campaignId, fields) {
  return post(`/ads/campaigns/${encodeURIComponent(campaignId)}/ads`, fields);
}
export async function updateAd(adId, fields) {
  return put(`/ads/${encodeURIComponent(adId)}`, fields);
}
export async function deleteAd(adId) {
  return del(`/ads/${encodeURIComponent(adId)}`);
}
export async function recordAdImpression(adId) {
  return post(`/ads/${encodeURIComponent(adId)}/impression`, {});
}
export async function recordAdClick(adId) {
  return post(`/ads/${encodeURIComponent(adId)}/click`, {});
}

/* ── PPV (Creator Dashboard) ── */
export async function createPpvContent(fields) {
  const data = await post('/ppv/content', fields);
  return data.content;
}
export async function listPpvContent({ status = 'all', limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({ status, limit, offset });
  const data = await get(`/ppv/content?${params}`);
  return data;
}
export async function getPpvContent(contentId) {
  return get(`/ppv/content/${contentId}`);
}
export async function updatePpvContent(contentId, fields) {
  const data = await patch(`/ppv/content/${contentId}`, fields);
  return data.content;
}
export async function updatePpvContentPrice(contentId, basePriceCents) {
  const data = await patch(`/ppv/content/${contentId}/price`, { basePriceCents });
  return data.content;
}
export async function createPpvBundle(fields) {
  const data = await post('/ppv/bundles', fields);
  return data.bundle;
}
export async function listPpvBundles(status = 'active') {
  const data = await get(`/ppv/bundles?status=${status}`);
  return data.bundles || [];
}
export async function createPpvMassMessage(fields) {
  const data = await post('/ppv/mass-messages', fields);
  return data.message;
}
export async function listPpvMassMessages(limit = 50) {
  const data = await get(`/ppv/mass-messages?limit=${limit}`);
  return data.messages || [];
}
export async function sendPpvMassMessage(messageId) {
  return post(`/ppv/mass-messages/${messageId}/send`, {});
}
export async function schedulePpvStream(streamId, priceCents) {
  const data = await post(`/ppv/stream/${streamId}/schedule`, { priceCents });
  return data.stream;
}
export async function updatePpvStreamPrice(streamId, priceCents) {
  const data = await patch(`/ppv/stream/${streamId}/price`, { priceCents });
  return data.stream;
}
export async function listScheduledPpvStreams() {
  const data = await get('/ppv/scheduled');
  return data.streams || [];
}
export async function fetchPpvAnalytics({ startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const data = await get(`/ppv/analytics?${params}`);
  return data;
}
export async function unlockPpvStream(streamId) {
  const data = await post(`/ppv/stream/${streamId}/unlock`, {});
  return data.purchase;
}

/* ── Monetization (Creator Dashboard) ── */
export async function listUpsellFunnels(status = 'active') {
  const data = await get(`/monetization/funnels?status=${status}`);
  return data.funnels || [];
}
export async function createUpsellFunnel(fields) {
  const data = await post('/monetization/funnels', fields);
  return data.funnel;
}
export async function updateUpsellFunnel(funnelId, fields) {
  const data = await patch(`/monetization/funnels/${funnelId}`, fields);
  return data.funnel;
}
export async function deleteUpsellFunnel(funnelId) {
  await del(`/monetization/funnels/${funnelId}`);
}
export async function fetchFanAnalytics(limit = 20) {
  const data = await get(`/monetization/fan-analytics?limit=${limit}`);
  return data;
}
export async function fetchLiveTickets(status = 'all') {
  const data = await get(`/monetization/live-tickets?status=${status}`);
  return data.tickets || [];
}
export async function fetchCreatorRevenue({ startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const data = await get(`/monetization/revenue?${params}`);
  return data;
}

/* ── Compliance / DSAR ── */
export async function fetchDsarRequests() {
  const data = await get('/compliance/dsar');
  return data;
}
/** Request DSAR export or delete. type: 'export' | 'delete' | 'rectification' | 'restriction' */
export async function requestDsar(type, lawBasis = 'gdpr') {
  return post('/dsar/request', { type, lawBasis });
}
/** Download user data export (DSAR). Returns JSON. */
export async function getDsarExport() {
  return get('/dsar/export');
}
/** Delete account (right to erasure). confirm: true required. */
export async function requestDsarDelete(confirm = true, immediate = false) {
  return post('/dsar/delete', { confirm, immediate });
}
/** Recent DSAR requests for the current user (status / type). */
export async function fetchDsarRequestList() {
  const data = await get('/dsar/requests');
  return data.requests || [];
}
export async function submitConsent(purpose, version, granted = true, meta) {
  return post('/compliance/consent', { purpose, version, granted, meta });
}
export async function fetchAgeCheck() {
  const data = await get('/compliance/age-check');
  return data;
}
/** CCPA Do Not Sell — get/set opt-out status. */
export async function getCcpaDoNotSell() {
  return get('/compliance/ccpa/do-not-sell');
}
export async function setCcpaDoNotSell(optedOut) {
  return post('/compliance/ccpa/do-not-sell', { optedOut });
}
/** IP logging preference — get/set. */
export async function getIpLoggingStatus() {
  return get('/compliance/ip-logging');
}
export async function setIpLoggingPreference(allowIpLogging) {
  return post('/compliance/ip-logging', { allowIpLogging });
}
