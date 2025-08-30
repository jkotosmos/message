import { useAppStore } from '../store';

export async function authorizedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { accessToken, refreshToken, apiBase } = useAppStore.getState();
  let headers = new Headers(init.headers as HeadersInit);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  let res = await fetch(input, { ...init, headers });
  if (res.status !== 401) return res;
  // try refresh
  if (!refreshToken) return res;
  const refreshRes = await fetch(`${apiBase}/api/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!refreshRes.ok) return res;
  const { accessToken: newAccess } = await refreshRes.json();
  useAppStore.setState({ accessToken: newAccess });
  headers = new Headers(init.headers as HeadersInit);
  headers.set('Authorization', `Bearer ${newAccess}`);
  res = await fetch(input, { ...init, headers });
  return res;
}

