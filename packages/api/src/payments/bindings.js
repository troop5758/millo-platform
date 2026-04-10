'use strict';
/**
 * Populated by `routes/payments.js` after webhook handlers are defined.
 * `payments/routes/webhooks.js` dispatches to these so routes stay modular without duplicating logic.
 * https://milloapp.com
 */
module.exports = {
  stripe: null,
  paypal: null,
  wise: null,
};
