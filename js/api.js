// Client for the game server's API. Every online feature checks serverFeatures() first, so the
// single-player game still works from any static host without the server.

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let featuresPromise = null;

/** Resolves to the server's feature flags, or null when there is no game server. */
export function serverFeatures() {
  featuresPromise ??= fetch('/api/config', { headers: { Accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return featuresPromise;
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api/${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network', 'Can’t reach the game server. Check your connection and try again.', 0);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? 'server_error', data?.message ?? 'Something went wrong on the server.', res.status);
  }
  return data;
}

export function appUrl(params) {
  const url = new URL(location.origin + location.pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}
