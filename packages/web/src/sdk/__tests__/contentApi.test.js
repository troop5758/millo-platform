/**
 * contentApi.js unit tests — Vitest
 * Mocks globalThis.fetch and localStorage so no real network calls are made.
 * Covers: streams, feed, search, creator profile, follow/unfollow, gifts,
 *         wallet, DM, notifications, analytics, payments, shop, VOD, streams.
 * https://milloapp.com
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ── localStorage mock (needed for authApi token used by contentApi) ── */
const store = {};
const localStorageMock = {
  getItem:    (k)    => store[k] ?? null,
  setItem:    (k, v) => { store[k] = String(v); },
  removeItem: (k)    => { delete store[k]; },
  clear:      ()     => { for (const k in store) delete store[k]; },
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

/* ── import.meta shim (Vitest handles this, but set VITE_API_URL) ── */
vi.stubEnv('VITE_API_URL', 'http://localhost:3001');

/* ── import after mocks ── */
const {
  fetchStreams,
  fetchFeed,
  search,
  searchAdvanced,
  fetchCreator,
  updateProfile,
  followUser,
  unfollowUser,
  sendGift,
  fetchWallet,
  fetchConversations,
  sendMessage,
  fetchNotifications,
  markNotificationsRead,
  fetchMyAnalytics,
  fetchMySubscriptions,
  cancelSubscription,
  requestPayout,
  fetchPayoutHistory,
  fetchCreatorPayoutRequirements,
  fetchCreatorProducts,
  fetchProduct,
  fetchAuctions,
  placeBid,
  fetchVODs,
  fetchVOD,
  fetchStream,
  startStream,
  stopStream,
  blockUser,
  unblockUser,
  reportContent,
} = await import('../contentApi.js');

/* ── fetch mock helpers ── */
function mockFetch(status, body) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok:   status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}
function mockFetchErr(status, errorMsg = 'Bad Request') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: errorMsg }),
  });
}

beforeEach(() => { localStorageMock.clear(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

/* ─────────────────────────────────────────── */
describe('fetchStreams()', () => {
  it('returns stream data from the API', async () => {
    mockFetch(200, { streams: [{ id: 's1', title: 'My Stream' }], counts: { all: 1 } });
    const result = await fetchStreams('all');
    expect(result.streams).toHaveLength(1);
    expect(result.streams[0].title).toBe('My Stream');
  });

  it('throws on non-ok response', async () => {
    mockFetchErr(500);
    await expect(fetchStreams()).rejects.toThrow();
  });
});

describe('fetchFeed()', () => {
  it('returns feed items', async () => {
    mockFetch(200, { items: [{ id: 'f1' }, { id: 'f2' }] });
    const result = await fetchFeed('foryou', 'all', 20, 0);
    expect(result.items).toHaveLength(2);
  });
});

describe('search()', () => {
  it('calls discovery when query is blank', async () => {
    mockFetch(200, { users: [], streams: [], products: [], discovery: true, total: 0 });
    await search('');
    expect(globalThis.fetch).toHaveBeenCalled();
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/content/search');
    expect(url).toContain('q=');
  });

  it('calls API with encoded query', async () => {
    mockFetch(200, { users: [], streams: [], products: [] });
    await search('hello world');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('q=hello%20world');
  });
});

describe('searchAdvanced()', () => {
  it('fetches trending discovery for blank query', async () => {
    mockFetch(200, {
      users: [],
      streams: [],
      products: [],
      trendingHashtags: [],
      discovery: true,
      total: 0,
    });
    const result = await searchAdvanced({ q: '   ' });
    expect(result.discovery).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('includes type and category params when provided', async () => {
    mockFetch(200, { users: [], streams: [] });
    await searchAdvanced({ q: 'test', type: 'creators', category: 'gaming' });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('type=creators');
    expect(url).toContain('category=gaming');
  });
});

describe('fetchCreator()', () => {
  it('returns creator object from response', async () => {
    mockFetch(200, { creator: { id: 'c1', displayName: 'TestCreator' } });
    const creator = await fetchCreator('c1');
    expect(creator.displayName).toBe('TestCreator');
  });

  it('throws on 404', async () => {
    mockFetchErr(404);
    await expect(fetchCreator('unknown')).rejects.toThrow();
  });
});

describe('followUser() / unfollowUser()', () => {
  it('sends POST to follow endpoint', async () => {
    mockFetch(200, { ok: true });
    await followUser('u2');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/profile/follow/u2');
    expect(opts.method).toBe('POST');
  });

  it('sends DELETE to unfollow endpoint', async () => {
    mockFetch(200, { ok: true });
    await unfollowUser('u2');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/profile/follow/u2');
    expect(opts.method).toBe('DELETE');
  });
});

describe('sendGift()', () => {
  it('posts gift payload with timestamp for anti-replay', async () => {
    mockFetch(200, { ok: true, newBalance: 900 });
    await sendGift('receiver1', 'gift-rose', 50);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.receiverId).toBe('receiver1');
    expect(body.giftId).toBe('gift-rose');
    expect(body.coins).toBe(50);
    expect(typeof body.timestamp).toBe('number');
  });
});

describe('fetchWallet()', () => {
  it('returns wallet object', async () => {
    mockFetch(200, { wallet: { balanceCents: 2500, coins: 100 } });
    const wallet = await fetchWallet();
    expect(wallet.balanceCents).toBe(2500);
  });
});

describe('fetchConversations() / sendMessage()', () => {
  it('returns conversations array', async () => {
    mockFetch(200, { conversations: [{ id: 'dm1' }] });
    const convs = await fetchConversations();
    expect(convs).toHaveLength(1);
  });

  it('returns empty array when conversations is missing', async () => {
    mockFetch(200, {});
    const convs = await fetchConversations();
    expect(convs).toEqual([]);
  });

  it('posts message body to correct endpoint', async () => {
    mockFetch(200, { message: { id: 'm1' } });
    await sendMessage('u3', 'Hello!');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.receiverId).toBe('u3');
    expect(body.body).toBe('Hello!');
  });
});

describe('fetchNotifications() / markNotificationsRead()', () => {
  it('returns notification data', async () => {
    mockFetch(200, { notifications: [{ id: 'n1' }], unread: 1 });
    const result = await fetchNotifications();
    expect(result.notifications).toHaveLength(1);
  });

  it('posts read status with ids', async () => {
    mockFetch(200, { ok: true });
    await markNotificationsRead(['n1', 'n2']);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.ids).toEqual(['n1', 'n2']);
  });

  it('posts empty body when ids is null (mark all read)', async () => {
    mockFetch(200, { ok: true });
    await markNotificationsRead(null);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body).toEqual({});
  });
});

describe('fetchMyAnalytics()', () => {
  it('returns analytics object', async () => {
    mockFetch(200, { analytics: { followers: 500, revenue30dCents: 12000 } });
    const analytics = await fetchMyAnalytics();
    expect(analytics.followers).toBe(500);
  });
});

describe('fetchMySubscriptions() / cancelSubscription()', () => {
  it('returns subscriptions array', async () => {
    mockFetch(200, { subscriptions: [{ id: 'sub1', plan: 'creator' }] });
    const subs = await fetchMySubscriptions();
    expect(subs[0].plan).toBe('creator');
  });

  it('returns empty array when subscriptions is missing', async () => {
    mockFetch(200, {});
    const subs = await fetchMySubscriptions();
    expect(subs).toEqual([]);
  });

  it('posts cancel with subscriptionId', async () => {
    mockFetch(200, { ok: true });
    await cancelSubscription('sub1');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.subscriptionId).toBe('sub1');
  });
});

describe('requestPayout() / fetchPayoutHistory()', () => {
  it('posts payout request with amountCents', async () => {
    mockFetch(200, { ok: true, payout: { id: 'p1' }, newBalance: 0 });
    await requestPayout(5000);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.amountCents).toBe(5000);
  });

  it('throws on insufficient balance (4xx)', async () => {
    mockFetchErr(422, 'Insufficient balance');
    await expect(requestPayout(99999999)).rejects.toThrow();
  });

  it('returns payouts array', async () => {
    mockFetch(200, { payouts: [{ id: 'p1', amountCents: 5000, status: 'pending' }] });
    const payouts = await fetchPayoutHistory();
    expect(payouts[0].status).toBe('pending');
  });
});

describe('fetchCreatorPayoutRequirements()', () => {
  it('GETs /compliance/creator/payout-requirements', async () => {
    mockFetch(200, { ok: true, payoutReady: false, requirements: [] });
    await fetchCreatorPayoutRequirements();
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('/compliance/creator/payout-requirements');
  });
});

describe('fetchCreatorProducts() / fetchProduct()', () => {
  it('returns products array', async () => {
    mockFetch(200, { products: [{ id: 'pr1', name: 'Shirt' }] });
    const products = await fetchCreatorProducts('creator1');
    expect(products[0].name).toBe('Shirt');
  });

  it('includes category query param when provided', async () => {
    mockFetch(200, { products: [] });
    await fetchCreatorProducts('creator1', 'clothing');
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('category=clothing');
  });

  it('returns single product', async () => {
    mockFetch(200, { product: { id: 'pr1', name: 'Hat' } });
    const product = await fetchProduct('pr1');
    expect(product.name).toBe('Hat');
  });
});

describe('fetchAuctions() / placeBid()', () => {
  it('returns auctions array', async () => {
    mockFetch(200, { auctions: [{ id: 'a1', title: 'Rare Item' }] });
    const auctions = await fetchAuctions();
    expect(auctions[0].title).toBe('Rare Item');
  });

  it('posts bid with amountCents', async () => {
    mockFetch(200, { ok: true, auction: { id: 'a1', highBid: 1000 } });
    await placeBid('a1', 1000);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.amountCents).toBe(1000);
  });
});

describe('fetchVODs() / fetchVOD()', () => {
  it('fetches VOD list', async () => {
    mockFetch(200, { vods: [{ id: 'v1' }], total: 1 });
    const result = await fetchVODs({ limit: 10 });
    expect(result.vods).toHaveLength(1);
  });

  it('includes creatorId param when provided', async () => {
    mockFetch(200, { vods: [] });
    await fetchVODs({ creatorId: 'c1', limit: 5 });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toContain('creatorId=c1');
  });
});

describe('fetchStream() / startStream() / stopStream()', () => {
  it('returns stream data', async () => {
    mockFetch(200, { stream: { id: 'st1', title: 'Gaming Stream', status: 'live' } });
    const result = await fetchStream('st1');
    expect(result.stream.status).toBe('live');
  });

  it('posts startStream with correct fields', async () => {
    mockFetch(200, { stream: { id: 'st2' }, rtmpUrl: 'rtmp://example.com', streamKey: 'key123' });
    await startStream('My Stream', 'public', 0);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.title).toBe('My Stream');
    expect(body.visibility).toBe('public');
  });

  it('posts stopStream to correct endpoint', async () => {
    mockFetch(200, { ok: true });
    await stopStream('st2');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/st2/stop');
    expect(opts.method).toBe('POST');
  });
});

describe('blockUser() / unblockUser()', () => {
  it('sends POST to block endpoint', async () => {
    mockFetch(200, { ok: true });
    await blockUser('badUser');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/profile/block/badUser');
    expect(opts.method).toBe('POST');
  });

  it('sends DELETE to unblock endpoint', async () => {
    mockFetch(200, { ok: true });
    await unblockUser('badUser');
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('/profile/block/badUser');
    expect(opts.method).toBe('DELETE');
  });
});

describe('reportContent()', () => {
  it('posts report with all fields', async () => {
    mockFetch(200, { ok: true });
    await reportContent('target1', 'stream', 'spam', 'This is spam');
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.targetId).toBe('target1');
    expect(body.targetType).toBe('stream');
    expect(body.reason).toBe('spam');
  });
});
