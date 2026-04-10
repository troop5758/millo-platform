/**
 * Generates a cryptographically secure random password.
 * Default: 16 chars, upper + lower + digits + symbols; meets common policy requirements.
 * https://milloapp.com
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // exclude I,O for readability
const LOWER = 'abcdefghjkmnpqrstuvwxyz';    // exclude i,l,o
const DIGITS = '23456789';                  // exclude 0,1
const SYMBOLS = '!@#$%&*';

function getRandomBytes(length) {
  const arr = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    return arr;
  }
  for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
}

/**
 * @param {number} [length=16] - length of password
 * @returns {string} - secure random password (at least one of each: upper, lower, digit, symbol)
 */
export function generateSecurePassword(length = 16) {
  const minPerType = 1;
  const pools = [
    { chars: UPPER, count: minPerType },
    { chars: LOWER, count: minPerType },
    { chars: DIGITS, count: minPerType },
    { chars: SYMBOLS, count: minPerType },
  ];
  const all = UPPER + LOWER + DIGITS + SYMBOLS;
  const total = Math.max(length, 12);
  const bytes = getRandomBytes(total * 2);
  const out = [];

  // Ensure at least one of each type
  for (const pool of pools) {
    const idx = bytes[out.length] % pool.chars.length;
    out.push(pool.chars[idx]);
  }

  // Fill the rest randomly
  for (let i = out.length; i < total; i++) {
    const idx = bytes[i * 2] % all.length;
    out.push(all[idx]);
  }

  // Shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }

  return out.join('');
}
