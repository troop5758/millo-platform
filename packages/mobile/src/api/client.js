/**
 * Millo mobile API client.
 * Reads token from SecureStore for authenticated requests.
 */
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const BASE = Constants.expoConfig?.extra?.apiUrl ?? 'https://api.milloapp.com';
const TOKEN_KEY = 'millo_token';

export async function getToken() {
  try { return await SecureStore.getItemAsync(TOKEN_KEY) || ''; }
  catch { return ''; }
}
export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

async function headers(extra = {}) {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: await headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

export async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: await headers(), body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

export async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: await headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}
