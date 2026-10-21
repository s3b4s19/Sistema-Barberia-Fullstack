const meta = document.querySelector('meta[name="api-base"]');
const API_BASE = (meta?.getAttribute('content') || 'http://localhost:4000/api').replace(/\/$/, '');
const REFRESH_KEY = 'barberia.admin.refresh';

let accessToken = null;
let refreshToken = readRefreshToken();
let refreshPromise = null;
let unauthorizedHandler = null;

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readRefreshToken() {
  try {
    return window.sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(value) {
  try {
    if (value) {
      window.sessionStorage.setItem(REFRESH_KEY, value);
    } else {
      window.sessionStorage.removeItem(REFRESH_KEY);
    }
  } catch {
    // sessionStorage puede fallar en modo privado; la sesión dura lo que la pestaña.
  }
}

function setSession(data) {
  accessToken = data?.accessToken ?? null;
  refreshToken = data?.refreshToken ?? null;
  writeRefreshToken(refreshToken);
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  writeRefreshToken(null);
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function getStoredSession() {
  return { hasRefreshToken: Boolean(refreshToken) };
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok || !payload?.ok) {
    throw new ApiError(payload?.error?.message || 'No pudimos completar la solicitud.', {
      code: payload?.error?.code,
      status: response.status,
      details: payload?.error?.details ?? null,
    });
  }

  return payload.data;
}

async function rawRequest(
  path,
  { method = 'GET', body = null, auth = false, timeout = 20000 } = {},
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined && body !== null ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });

    return { response, data: await parseResponse(response) };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new ApiError('La solicitud tardó demasiado. Revisa tu conexión.', {
        code: 'TIMEOUT',
      });
    }

    throw new ApiError('No pudimos conectar con el servidor.', {
      code: 'NETWORK_ERROR',
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function refreshSession() {
  if (!refreshToken) {
    throw new ApiError('La sesión expiró.', { code: 'UNAUTHORIZED', status: 401 });
  }

  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
    })
      .then(({ data }) => {
        setSession(data);
        return data;
      })
      .catch((error) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function apiRequest(path, options = {}) {
  const { auth = true, retried = false, ...rest } = options;

  try {
    const { data } = await rawRequest(path, { ...rest, auth });
    return data;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && auth && !retried) {
      try {
        await refreshSession();
        return apiRequest(path, { ...options, retried: true });
      } catch {
        clearSession();
        unauthorizedHandler?.();
        throw new ApiError('La sesión expiró. Inicia sesión nuevamente.', {
          code: 'UNAUTHORIZED',
          status: 401,
        });
      }
    }

    throw error;
  }
}

export async function login(identifier, password) {
  const { data } = await rawRequest('/auth/login', {
    method: 'POST',
    body: { identifier, password },
  });

  setSession(data);
  return data;
}

export async function restoreSession() {
  if (!refreshToken) {
    return null;
  }

  try {
    await refreshSession();
    const user = await apiRequest('/auth/me');
    return user;
  } catch {
    clearSession();
    return null;
  }
}

export async function changePassword(currentPassword, newPassword) {
  return apiRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function logout() {
  try {
    if (accessToken) {
      await apiRequest('/auth/logout', { method: 'POST' });
    }
  } catch {
    // El cierre local es suficiente aunque falle la revocación remota.
  } finally {
    clearSession();
  }
}

export function apiGet(path) {
  return apiRequest(path);
}

export function apiPost(path, body) {
  return apiRequest(path, { method: 'POST', body });
}

export function apiPatch(path, body) {
  return apiRequest(path, { method: 'PATCH', body });
}

export function apiPut(path, body) {
  return apiRequest(path, { method: 'PUT', body });
}

export function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' });
}
