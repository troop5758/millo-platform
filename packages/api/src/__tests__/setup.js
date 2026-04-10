/**
 * Vitest setup — mock all workspace packages so route tests run in isolation.
 * Routes load without real DB / external services; auth guards still work
 * because resolveSession() short-circuits on missing token before any DB call.
 */
import { vi } from 'vitest';

/* Chainable query builder — every method returns itself so any chain works */
function makeChain() {
  const chain = {
    lean:     () => Promise.resolve([]),
    exec:     () => Promise.resolve([]),
    sort:     () => chain,
    limit:    () => chain,
    skip:     () => chain,
    select:   () => chain,
    populate: () => chain,
    where:    () => chain,
  };
  return chain;
}

/* Minimal Mongoose model factory — returns a stub with the common query methods */
function makeModel() {
  return {
    findOne:          vi.fn().mockResolvedValue(null),
    findById:         vi.fn().mockReturnValue({ lean: () => Promise.resolve(null), exec: () => Promise.resolve(null) }),
    find:             vi.fn().mockReturnValue(makeChain()),
    findByIdAndUpdate: vi.fn().mockResolvedValue(null),
    findByIdAndDelete: vi.fn().mockResolvedValue(null),
    findOneAndUpdate: vi.fn().mockResolvedValue(null),
    updateOne:        vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    updateMany:       vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    deleteOne:        vi.fn().mockResolvedValue({ deletedCount: 0 }),
    countDocuments:   vi.fn().mockResolvedValue(0),
    aggregate:        vi.fn().mockResolvedValue([]),
    create:           vi.fn().mockResolvedValue({ _id: 'mock_id', save: vi.fn().mockResolvedValue({}) }),
    lean:             vi.fn().mockResolvedValue(null),
  };
}

function makeDbBundle() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    models: {},
    User:            makeModel(),
    Session:         makeModel(),
    Stream:          makeModel(),
    LiveStream:      makeModel(),
    Profile:         makeModel(),
    LiveViewer:      makeModel(),
    CoHostInvite:     makeModel(),
    LiveStreamMetrics: makeModel(),
    DeviceAnalytics:  makeModel(),
    Notification:    makeModel(),
    Wallet:          makeModel(),
    Gift:            makeModel(),
    Product:         makeModel(),
    Auction:         makeModel(),
    AuctionBid:      makeModel(),
    Subscription:    makeModel(),
    LedgerEntry:     makeModel(),
    PayoutRequest:   makeModel(),
    Order:           makeModel(),
    ShippingAddress: makeModel(),
    VOD:             makeModel(),
    Creator:         makeModel(),
    PlatformSettings: makeModel(),
    CoinTopUp:       makeModel(),
    CoinPack:         makeModel(),
    SellerVerification: makeModel(),
    FinancialAuditLog: makeModel(),
    Report:          makeModel(),
    Post:            makeModel(),
    Comment:         makeModel(),
    UserSecurity:    makeModel(),
    LoginEvent:      makeModel(),
  };
}

vi.mock('@millo/database', () => {
  const bundle = makeDbBundle();
  return { default: bundle, ...bundle };
});

vi.mock('@millo/live', () => {
  const liveMock = {
    createStream:    vi.fn().mockResolvedValue({ _id: 'stream1', streamKey: 'key1', ingestUrl: 'rtmp://test', playbackUrl: 'https://test' }),
    endStream:       vi.fn().mockResolvedValue({}),
    getStreamById:   vi.fn().mockResolvedValue(null),
    getActiveStreams: vi.fn().mockResolvedValue([]),
    addModeration:   vi.fn().mockResolvedValue({}),
    getFiltersEnabled: vi.fn().mockReturnValue(false),
    setFiltersEnabled: vi.fn(),
    getFilterPresets:  vi.fn().mockResolvedValue([]),
    applyFilter:       vi.fn().mockResolvedValue({}),
  };
  return { default: liveMock, ...liveMock };
});

vi.mock('@millo/milla', () => ({
  default: {},
  getMillaState:  vi.fn().mockResolvedValue({ active: false }),
  setCohostMode:  vi.fn().mockResolvedValue({}),
  setMuted:       vi.fn().mockResolvedValue({}),
  processGift:    vi.fn().mockResolvedValue({}),
}));

vi.mock('@millo/billing', () => ({
  default: {},
}));

vi.mock('@millo/billing/src/stripe', () => ({
  default: {
    paymentIntents: { create: vi.fn(), confirm: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
    accounts: { create: vi.fn(), retrieve: vi.fn() },
    transfers: { create: vi.fn() },
  },
}));

vi.mock('@millo/economy', () => ({
  default: {},
  pricing: { coins: {}, subscriptions: {} },
  COIN_PACKAGES: [],
  SUBSCRIPTION_TIERS: [],
}));

vi.mock('@millo/notifications', () => ({
  default: {},
  sendEmail:    vi.fn().mockResolvedValue({}),
  sendPushNotification: vi.fn().mockResolvedValue({}),
}));

vi.mock('@millo/compliance', () => ({
  default: {},
  checkContent: vi.fn().mockResolvedValue({ approved: true }),
}));

vi.mock('@millo/dashboards', () => ({
  default: {},
  getAdminStats: vi.fn().mockResolvedValue({}),
}));

vi.mock('@millo/level-trust', () => ({
  default: {},
  getUserTrustLevel: vi.fn().mockResolvedValue(1),
}));

vi.mock('@millo/tv', () => ({
  default: {},
}));

vi.mock('@millo/self-observation', () => ({
  default: {},
  observe: vi.fn(),
}));

vi.mock('@millo/security', () => ({
  default: {},
  checkRateLimit: vi.fn().mockResolvedValue(true),
  getRateLimitConfig: vi.fn().mockReturnValue({ max: 1000, timeWindow: '1 minute' }),
  getCSPHeader: vi.fn().mockReturnValue("default-src 'none'"),
  getHSTSHeader: vi.fn().mockReturnValue('max-age=31536000; includeSubDomains; preload'),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash:    vi.fn().mockResolvedValue('$2a$12$mockhash'),
    compare: vi.fn().mockResolvedValue(false),
    genSalt: vi.fn().mockResolvedValue('$2a$12$mocksalt'),
  },
  hash:    vi.fn().mockResolvedValue('$2a$12$mockhash'),
  compare: vi.fn().mockResolvedValue(false),
  genSalt: vi.fn().mockResolvedValue('$2a$12$mocksalt'),
}));

vi.mock('@sentry/node', () => ({
  default: {},
  init:    vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((cb) => cb({ setExtra: vi.fn() })),
}));
