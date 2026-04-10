/**
 * Per-minute billing + free buffer. https://milloapp.com
 */
const FREE_BUFFER_MINUTES = 5;
const CENTS_PER_MINUTE = 10;
const MAX_SESSION_MINUTES = 120; // 2h default cap

function getFreeBufferMinutes() {
  return Number(process.env.DM_FREE_BUFFER_MINUTES) || FREE_BUFFER_MINUTES;
}

function getCentsPerMinute() {
  return Number(process.env.DM_CENTS_PER_MINUTE) || CENTS_PER_MINUTE;
}

function getMaxSessionMinutes() {
  return Number(process.env.DM_MAX_SESSION_MINUTES) || MAX_SESSION_MINUTES;
}

/**
 * Compute charge: (totalMinutes - freeBufferMinutes) * centsPerMinute, min 0.
 * Capped by DM_MAX_SESSION_MINUTES (timeout enforcement).
 */
function computeCharge(totalMinutes, freeBufferMinutes) {
  const free = freeBufferMinutes ?? getFreeBufferMinutes();
  const max = getMaxSessionMinutes();
  const capped = Math.min(totalMinutes, max);
  const billable = Math.max(0, Math.floor(capped) - Math.floor(free));
  const rate = getCentsPerMinute();
  return {
    billableMinutes: billable,
    amountCents: billable * rate,
    capped: totalMinutes > max,
  };
}

module.exports = { getFreeBufferMinutes, getCentsPerMinute, getMaxSessionMinutes, computeCharge };
