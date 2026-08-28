// Thin fetch wrapper over the /api routes (functions/, dispatched by
// functions/_worker.js). Token lives in localStorage so it survives reloads.
// Pattern ported from howellsryan/pocketrpg's src/cloud/api.js, trimmed to
// what Pitch's single-save-per-account v1 needs — no character id, no
// native-app login hook (Pitch is web-only).
//
// Ambient browser APIs go through `window.` throughout, matching the rest of
// src/lib/ui/ (e.g. MatchScreen.svelte's window.setTimeout) — eslint.config.mjs
// only whitelists `window` itself as a bare global, not fetch/localStorage/etc.

const TOKEN_KEY = 'pitch_cloud_token';
const REQUEST_TIMEOUT_MS = 15_000;

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export function isSignedIn() {
  return !!getToken();
}

export function clearAuth() {
  setToken(null);
}

// Pull a `#token=...` fragment dropped by the OAuth callback redirect into
// localStorage and clean the URL bar. Call once on boot (src/ui/renderers.js).
export function captureTokenFromHash() {
  if (!window.location.hash) return false;
  const match = window.location.hash.match(/[#&]token=([^&]+)/);
  if (!match) return false;
  setToken(decodeURIComponent(match[1]));
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

async function request(path, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, ...fetchOptions } = options;
  const headers = new window.Headers(fetchOptions.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const controller = new window.AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await window.fetch(path, { ...fetchOptions, headers, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error('request_timeout');
      timeoutErr.status = 0;
      throw timeoutErr;
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (res.status === 401) {
    clearAuth();
    const err = new Error('Not authenticated');
    err.status = 401;
    throw err;
  }
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  me: () => request('/api/auth/me'),
  getSave: () => request('/api/save'),
  putSave: (save_blob) => request('/api/save', {
    method: 'PUT',
    body: JSON.stringify({ save_blob }),
  }),
};

export function startGoogleLogin() {
  window.location.href = '/api/auth/google';
}
