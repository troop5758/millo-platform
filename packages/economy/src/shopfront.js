/**
 * Shopfront — creator storefront: list items (auction/ticket). Live commerce; no coin pack logic.
 * https://milloapp.com
 */

/** In-memory catalog: creatorId -> items. Persisted options can use a schema in a later phase. */
const shopfrontItems = new Map();

function getCreatorKey(creatorId) {
  return typeof creatorId === 'string' ? creatorId : creatorId?.toString?.() ?? String(creatorId);
}

/**
 * Get shopfront for creator (items offered for auction or ticketing).
 * @param {string} creatorId
 * @returns {{ creatorId: string, items: Array<{ itemId: string, type: 'auction'|'ticket', meta?: object }> }}
 */
function getShopfront(creatorId) {
  const key = getCreatorKey(creatorId);
  const items = shopfrontItems.get(key) || [];
  return { creatorId: key, items: [...items] };
}

/**
 * List items on a creator's shopfront.
 * @param {string} creatorId
 * @returns {Array<{ itemId: string, type: 'auction'|'ticket', meta?: object }>}
 */
function listItems(creatorId) {
  return getShopfront(creatorId).items;
}

/**
 * Add item to shopfront. Type determines sale path (auction or ticket).
 * @param {string} creatorId
 * @param {string} itemId
 * @param {'auction'|'ticket'} type
 * @param {object} [meta]
 */
function addItem(creatorId, itemId, type, meta = {}) {
  if (type !== 'auction' && type !== 'ticket') throw new Error('INVALID_SHOPFRONT_ITEM_TYPE');
  const key = getCreatorKey(creatorId);
  if (!shopfrontItems.has(key)) shopfrontItems.set(key, []);
  const items = shopfrontItems.get(key);
  if (items.some((i) => i.itemId === itemId)) throw new Error('ITEM_ALREADY_ON_SHOPFRONT');
  items.push({ itemId, type, meta });
  return { creatorId: key, itemId, type };
}

/**
 * Remove item from shopfront.
 * @param {string} creatorId
 * @param {string} itemId
 */
function removeItem(creatorId, itemId) {
  const key = getCreatorKey(creatorId);
  const items = shopfrontItems.get(key) || [];
  const idx = items.findIndex((i) => i.itemId === itemId);
  if (idx < 0) throw new Error('ITEM_NOT_ON_SHOPFRONT');
  items.splice(idx, 1);
  return { ok: true };
}

module.exports = { getShopfront, listItems, addItem, removeItem };
