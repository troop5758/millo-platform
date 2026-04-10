/**
 * Economy routes — shopfront, auctions list. https://milloapp.com
 */
const economy = require('@millo/economy');
const { validateId } = require('../lib/validateId');

async function economyRoutes(app) {
  app.get('/economy/shopfront/:creatorId', async (request, reply) => {
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const shopfront = economy.getShopfront(request.params.creatorId);
      const items = economy.listItems ? await economy.listItems(request.params.creatorId) : (shopfront && shopfront.items) || [];
      return reply.send({ ...shopfront, items: items || [] });
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });

  app.get('/economy/shopfront/:creatorId/auctions', async (request, reply) => {
    if (!validateId(request.params.creatorId, reply)) return;
    try {
      const shopfront = economy.getShopfront(request.params.creatorId);
      const items = economy.listItems ? await economy.listItems(request.params.creatorId) : (shopfront && shopfront.items) || [];
      const auctions = (items || []).filter(function (i) { return i.type === 'auction'; });
      return reply.send({ creatorId: request.params.creatorId, auctions });
    } catch (e) {
      return reply.status(400).send({ error: e.message });
    }
  });
}

module.exports = { economyRoutes };
