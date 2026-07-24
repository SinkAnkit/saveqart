const BASE = '/api';

function getToken() {
  return localStorage.getItem('saveqart_token');
}

async function request(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  signup: (payload) => request('/auth/signup', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),
  setLocation: (payload) => request('/auth/location', { method: 'PUT', body: payload }),
  search: (q, opts) => request(`/search?q=${encodeURIComponent(q)}`, opts),
  basketCompare: (items) => request('/basket/compare', { method: 'POST', body: { items } }),
  basketSave: (payload) => request('/basket/save', { method: 'POST', body: payload }),
  basketSaved: () => request('/basket/saved'),
  basketShared: (shareId) => request(`/basket/shared/${shareId}`, { auth: false }),
  basketDelete: (id) => request(`/basket/saved/${id}`, { method: 'DELETE' }),
  history: () => request('/history'),
  deleteHistoryItem: (id) => request(`/history/${id}`, { method: 'DELETE' }),
  clearHistory: () => request('/history', { method: 'DELETE' }),
  providers: () => request('/providers', { auth: false }),
  geocodeSearch: (q, session) =>
    request(`/geocode/search?q=${encodeURIComponent(q)}${session ? `&session=${encodeURIComponent(session)}` : ''}`, { auth: false }),
  geocodeReverse: (lat, lng) => request(`/geocode/reverse?lat=${lat}&lng=${lng}`, { auth: false }),
};

export function setToken(token) {
  if (token) localStorage.setItem('saveqart_token', token);
  else localStorage.removeItem('saveqart_token');
}
