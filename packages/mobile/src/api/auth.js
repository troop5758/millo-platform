import { post, get, saveToken, clearToken } from './client';

export async function login(email, password) {
  const data = await post('/auth/login', { email, password });
  if (data.token) await saveToken(data.token);
  return data;
}

export async function register(email, password, displayName) {
  const data = await post('/auth/register', { email, password, displayName });
  if (data.token) await saveToken(data.token);
  return data;
}

export async function logout() {
  await post('/auth/logout', {}).catch(() => {});
  await clearToken();
}

export async function fetchMe() {
  const data = await get('/auth/me');
  return data.user;
}
