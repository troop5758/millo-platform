'use strict';
/**
 * ObjectId validation helper — prevents Mongoose CastError 500s on malformed IDs.
 * Usage:
 *   const { validateId } = require('../lib/validateId');
 *   if (!validateId(request.params.id, reply)) return;
 * https://milloapp.com
 */
const { Types } = require('mongoose');

/**
 * Validates that `id` is a valid MongoDB ObjectId.
 * If invalid, sends a 400 response and returns false.
 * @param {string} id
 * @param {FastifyReply} reply
 * @returns {boolean}
 */
function validateId(id, reply) {
  if (!Types.ObjectId.isValid(id)) {
    reply.status(400).send({ error: 'INVALID_ID', message: `'${id}' is not a valid resource ID` });
    return false;
  }
  return true;
}

module.exports = { validateId };
