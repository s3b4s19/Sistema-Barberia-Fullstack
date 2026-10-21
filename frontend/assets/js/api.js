const meta = document.querySelector('meta[name="api-base"]');
const API_BASE = (meta?.getAttribute('content') || 'http://localhost:4000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body = null, signal = null, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeout);

  const abortFromOutside = () => controller.abort();
  signal?.addEventListener('abort', abortFromOutside, { once: true });

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.ok) {
      throw new ApiError(payload?.error?.message || 'No pudimos completar la solicitud.', {
        code: payload?.error?.code,
        status: response.status,
        details: payload?.error?.details ?? null,
      });
    }

    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      if (signal?.aborted) {
        throw error;
      }

      throw new ApiError('La solicitud tardó demasiado. Revisa tu conexión e intenta nuevamente.', {
        code: 'TIMEOUT',
      });
    }

    throw new ApiError('No pudimos conectar con el servidor. Revisa tu conexión e intenta nuevamente.', {
      code: 'NETWORK_ERROR',
    });
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromOutside);
  }
}

export function getSettings() {
  return request('/public/settings');
}

export function getServices() {
  return request('/public/services');
}

export function getBarbers() {
  return request('/public/barbers');
}

export function getHours() {
  return request('/public/hours');
}

export function getReviews(limit = 20) {
  return request(`/public/reviews?limit=${encodeURIComponent(limit)}`);
}

export function getDayAvailability({ date, serviceId, barberId = null, signal = null }) {
  const params = new URLSearchParams({ date, serviceId });

  if (barberId) {
    params.set('barberId', barberId);
  }

  return request(`/public/availability/day?${params.toString()}`, { signal });
}

export function createAppointment(payload) {
  return request('/appointments', { method: 'POST', body: payload });
}

export function lookupAppointment(code, phone) {
  const params = new URLSearchParams({ phone });
  return request(`/appointments/${encodeURIComponent(code)}?${params.toString()}`);
}

export function cancelAppointmentByCode(code, phone, reason = null) {
  return request(`/appointments/${encodeURIComponent(code)}/cancel`, {
    method: 'POST',
    body: { phone, reason: reason || null },
  });
}
