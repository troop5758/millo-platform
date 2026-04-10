'use strict';
/**
 * Tracking verification — AfterShip API. Used by support tickets and background job.
 * https://milloapp.com
 */

const AFTERSHIP_BASE = 'https://api.aftership.com/v4';

function getApiKey() {
  return process.env.AFTERSHIP_API_KEY || '';
}

/**
 * Map AfterShip tag to our trackingStatus enum.
 * AfterShip tags: Pending, InfoReceived, InTransit, OutForDelivery, Delivered, Exception, etc.
 */
function mapTagToStatus(tag) {
  if (!tag) return 'PENDING';
  const t = String(tag).toUpperCase().replace(/\s/g, '_');
  if (t === 'DELIVERED') return 'DELIVERED';
  if (['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'INFORECEIVED', 'PICKED_UP'].includes(t) || t.includes('TRANSIT')) return 'IN_TRANSIT';
  if (['EXCEPTION', 'EXPIRED', 'FAILURE', 'UNDELIVERED'].includes(t)) return 'FAILED';
  return 'PENDING';
}

/**
 * Verify tracking via AfterShip.
 * @param {string} trackingNumber
 * @param {string} carrier - carrier code (e.g. ups, usps, fedex)
 * @returns {Promise<{ status: string, lastUpdate?: object }>} status = PENDING | IN_TRANSIT | DELIVERED | FAILED
 */
async function verifyTracking(trackingNumber, carrier) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { status: 'PENDING', lastUpdate: null };
  }
  const tn = String(trackingNumber || '').trim();
  const car = String(carrier || '').trim().toLowerCase().replace(/\s/g, '');
  if (!tn || !car) {
    return { status: 'PENDING', lastUpdate: null };
  }

  const url = `${AFTERSHIP_BASE}/trackings/${encodeURIComponent(car)}/${encodeURIComponent(tn)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'aftership-api-key': apiKey,
    },
  });

  if (!res.ok) {
    if (res.status === 404) return { status: 'PENDING', lastUpdate: null };
    const err = await res.text();
    throw new Error(`AfterShip error ${res.status}: ${err}`);
  }

  const data = await res.json().catch(() => ({}));
  const tracking = data?.data?.tracking;
  if (!tracking) return { status: 'PENDING', lastUpdate: null };

  const tag = tracking.tag || tracking.status;
  const checkpoints = tracking.checkpoints || [];
  const lastUpdate = checkpoints.length ? checkpoints[checkpoints.length - 1] : null;

  return {
    status: mapTagToStatus(tag),
    lastUpdate,
  };
}

module.exports = { verifyTracking, mapTagToStatus };
