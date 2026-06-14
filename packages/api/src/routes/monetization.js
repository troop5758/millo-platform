/**
 * Monetization Routes — events, funnels, fan analytics, live tickets.
 * https://milloapp.com
 */
const controller = require('./monetization.controller');

async function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { resolveSession } = require('./auth');
  return resolveSession(token);
}

async function monetizationRoutes(app) {
  app.register(async (router) => {
      router.addHook('preHandler', async (request, reply) => {
        request.user = await authUser(request);
      });
    router.post('/event', controller.processEvent);
    router.get('/funnels', controller.listFunnels);
    router.post('/funnels', controller.createFunnel);
    router.patch('/funnels/:funnelId', controller.updateFunnel);
    router.delete('/funnels/:funnelId', controller.deleteFunnel);
    router.get('/fan-analytics', controller.getFanAnalytics);
    router.get('/live-tickets', controller.listLiveTickets);
    router.get('/revenue', controller.getCreatorRevenue);
  }, { prefix: '/monetization' });
}

module.exports = { monetizationRoutes };
