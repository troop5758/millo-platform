/**
 * KYC profile model — creator KYC verification status.
 * Wraps @millo/database CreatorKyc schema.
 * https://milloapp.com
 */
const db = require('@millo/database');

const KycProfile = db.CreatorKyc;

module.exports = { KycProfile };
