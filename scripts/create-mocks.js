'use strict';
const fs   = require('fs');
const path = require('path');

const root     = path.resolve(__dirname, '..');
const milloDir = path.join(root, 'node_modules', '@millo');

fs.mkdirSync(milloDir, { recursive: true });

/* Reusable Mongoose-like model stub */
const MODEL_CODE = `
'use strict';
const model = {
  findOne:           (...a) => ({ lean: () => Promise.resolve(null), exec: () => Promise.resolve(null) }),
  findById:          (...a) => ({ lean: () => Promise.resolve(null) }),
  find:              (...a) => ({
    lean:   () => Promise.resolve([]),
    sort:   () => ({ limit: () => ({ skip: () => ({ lean: () => Promise.resolve([]) }) }) }),
    limit:  () => ({ skip:  () => ({ lean: () => Promise.resolve([]) }) }),
    skip:   () => ({ lean: () => Promise.resolve([]) }),
    select: function() { return this; },
    exec:   () => Promise.resolve([]),
  }),
  countDocuments:    (...a) => Promise.resolve(0),
  findByIdAndUpdate: (...a) => Promise.resolve(null),
  findByIdAndDelete: (...a) => Promise.resolve(null),
  updateOne:         (...a) => Promise.resolve({ modifiedCount: 0 }),
  updateMany:        (...a) => Promise.resolve({ modifiedCount: 0 }),
  deleteOne:         (...a) => Promise.resolve({ deletedCount: 0 }),
  create:            (d)    => Promise.resolve(Object.assign({ _id: 'mock_id', save: () => Promise.resolve() }, d)),
  findOneAndUpdate:  (...a) => Promise.resolve(null),
  aggregate:         (...a) => Promise.resolve([]),
};
module.exports = model;
`;

function pkg(name) { return JSON.stringify({ name: `@millo/${name}`, version: '3.0.0', main: 'index.js' }, null, 2); }
function write(name, code) {
  const dir = path.join(milloDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), pkg(name));
  fs.writeFileSync(path.join(dir, 'index.js'), code);
  console.log(`Created @millo/${name}`);
}

/* ── @millo/database ── */
write('database', `
'use strict';
${MODEL_CODE.replace('module.exports = model;', '')}
const Wallet = Object.assign({}, model, {
  findOneAndUpdate: (...a) => Promise.resolve({ balanceCents: 0, save: () => Promise.resolve() }),
});
const db = {
  connect: () => Promise.resolve(),
  models: {},
  User: model, Session: model, Stream: model, Notification: model,
  Wallet, Gift: model, Product: model, Auction: model, AuctionBid: model,
  Subscription: model, LedgerEntry: model, PayoutRequest: model,
  Order: model, ShippingAddress: model, VOD: model, Creator: model,
  PlatformSettings: model,
};
module.exports = db;
`);

/* ── @millo/live ── */
write('live', `
'use strict';
module.exports = {
  createStream:    () => Promise.resolve({ _id: 'stream1', streamKey: 'key1', ingestUrl: 'rtmp://test', playbackUrl: 'https://test' }),
  endStream:       () => Promise.resolve({}),
  getStreamById:   () => Promise.resolve(null),
  getActiveStreams: () => Promise.resolve([]),
  addModeration:   () => Promise.resolve({}),
};
`);

/* ── @millo/milla ── */
write('milla', `
'use strict';
module.exports = {
  getMillaState: () => Promise.resolve({ active: false }),
  setCohostMode: () => Promise.resolve({}),
  setMuted:      () => Promise.resolve({}),
  processGift:   () => Promise.resolve({}),
};
`);

/* ── @millo/economy ── */
write('economy', `
'use strict';
module.exports = {
  pricing: { coins: {}, subscriptions: {} },
  COIN_PACKAGES: [],
  SUBSCRIPTION_TIERS: [],
};
`);

/* ── @millo/notifications ── */
write('notifications', `
'use strict';
module.exports = {
  sendEmail: () => Promise.resolve({}),
  sendPushNotification: () => Promise.resolve({}),
};
`);

/* ── @millo/billing ── */
const billingDir = path.join(milloDir, 'billing');
fs.mkdirSync(path.join(billingDir, 'src'), { recursive: true });
fs.writeFileSync(path.join(billingDir, 'package.json'), pkg('billing'));
const stripeStub = `
'use strict';
module.exports = {
  paymentIntents: { create: () => Promise.resolve({ client_secret: 'cs_test', id: 'pi_test' }), confirm: () => Promise.resolve({ status: 'succeeded' }) },
  checkout: { sessions: { create: () => Promise.resolve({ url: 'https://checkout.stripe.com/test', id: 'cs_test' }) } },
  webhooks: { constructEvent: () => ({ type: 'payment_intent.succeeded', data: { object: {} } }) },
  accounts: { create: () => Promise.resolve({ id: 'acct_test' }), retrieve: () => Promise.resolve({ id: 'acct_test', charges_enabled: false }) },
  transfers: { create: () => Promise.resolve({ id: 'tr_test' }) },
};
`;
fs.writeFileSync(path.join(billingDir, 'index.js'), "'use strict';\nmodule.exports = {};");
fs.writeFileSync(path.join(billingDir, 'src', 'stripe.js'), stripeStub);
console.log('Created @millo/billing');

/* ── Simple stubs ── */
const simpleStubs = {
  compliance:       `'use strict';\nmodule.exports = { checkContent: () => Promise.resolve({ approved: true }) };`,
  dashboards:       `'use strict';\nmodule.exports = { getAdminStats: () => Promise.resolve({}) };`,
  'level-trust':    `'use strict';\nmodule.exports = { getUserTrustLevel: () => Promise.resolve(1) };`,
  tv:               `'use strict';\nmodule.exports = {};`,
  'self-observation': `'use strict';\nmodule.exports = { observe: () => {} };`,
  security:         `'use strict';\nmodule.exports = { checkRateLimit: () => Promise.resolve(true) };`,
};

for (const [name, code] of Object.entries(simpleStubs)) {
  write(name, code);
}

console.log('\nDone! All @millo mock packages created.');
