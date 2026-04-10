/**
 * offlineDmSync — queue DM sends when offline, flush when connectivity returns.
 * Uses @react-native-community/netinfo for connectivity detection.
 * Queue is persisted in AsyncStorage so it survives app restarts.
 * https://milloapp.com
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'millo_dm_offline_queue';
const API_BASE  = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// --------------------------------------------------------------------------
// Queue helpers (AsyncStorage-backed, JSON array)
// --------------------------------------------------------------------------
async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items) {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { /* ignore write errors */ }
}

/** Add a pending DM send to the offline queue. */
export async function enqueueDm({ toUserId, text, token }) {
  const queue = await readQueue();
  queue.push({ toUserId, text, token, queuedAt: Date.now(), attempts: 0 });
  await writeQueue(queue);
}

/** Count pending items in the queue. */
export async function pendingCount() {
  const q = await readQueue();
  return q.length;
}

// --------------------------------------------------------------------------
// Flush — called when connectivity is restored
// --------------------------------------------------------------------------
async function flushQueue() {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const res = await fetch(`${API_BASE}/dm/messages`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(item.token ? { Authorization: `Bearer ${item.token}` } : {}),
        },
        body: JSON.stringify({ receiverId: item.toUserId, body: item.text }),
      });
      if (!res.ok) {
        // Keep if server error (5xx); drop on client error (4xx)
        if (res.status >= 500) remaining.push({ ...item, attempts: item.attempts + 1 });
      }
      // 2xx — message delivered, drop from queue
    } catch {
      // Network still unavailable or request timed out — keep in queue
      remaining.push({ ...item, attempts: item.attempts + 1 });
    }
  }

  await writeQueue(remaining);
  return queue.length - remaining.length; // number of messages flushed
}

// --------------------------------------------------------------------------
// Connectivity monitor — starts on import, cleans up via returned fn
// --------------------------------------------------------------------------
let _unsubscribe = null;
let _netInfo = null;

export function startOfflineDmSync() {
  // Lazy-load NetInfo to avoid hard crash if not installed
  try {
    _netInfo = require('@react-native-community/netinfo').default;
  } catch {
    console.warn('[offlineDmSync] @react-native-community/netinfo not installed — offline sync disabled');
    return () => {};
  }

  _unsubscribe = _netInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      flushQueue().catch(() => null);
    }
  });

  // Also try to flush on startup (might already be online)
  _netInfo.fetch().then((state) => {
    if (state.isConnected) flushQueue().catch(() => null);
  }).catch(() => null);

  return stopOfflineDmSync;
}

export function stopOfflineDmSync() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}

export { flushQueue };
