'use strict';
/**
 * User preference: skip optional client device fingerprint collection / persistence.
 * https://milloapp.com
 */

function userOptedOutOfFingerprinting(user) {
  return !!(user && user.optOutFingerprinting);
}

module.exports = { userOptedOutOfFingerprinting };
