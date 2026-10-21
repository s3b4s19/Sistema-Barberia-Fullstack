import { ApiError } from './errors.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireString(value, field, { min = 1, max = 500, trim = true } = {}) {
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`El campo ${field} es obligatorio`, 'INVALID_INPUT', { field });
  }

  const normalized = trim ? value.trim() : value;

  if (normalized.length < min) {
    throw ApiError.badRequest(
      `El campo ${field} debe tener al menos ${min} caracteres`,
      'INVALID_INPUT',
      { field },
    );
  }

  if (normalized.length > max) {
    throw ApiError.badRequest(
      `El campo ${field} no puede superar ${max} caracteres`,
      'INVALID_INPUT',
      { field },
    );
  }

  return normalized;
}

export function optionalString(value, field, { max = 500 } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw ApiError.badRequest(`El campo ${field} no es válido`, 'INVALID_INPUT', { field });
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > max) {
    throw ApiError.badRequest(
      `El campo ${field} no puede superar ${max} caracteres`,
      'INVALID_INPUT',
      { field },
    );
  }

  return normalized;
}

export function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw ApiError.badRequest(`El campo ${field} no es un identificador válido`, 'INVALID_INPUT', {
      field,
    });
  }

  return value.trim().toLowerCase();
}

export function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return requireUuid(value, field);
}

export function parseUuidList(value, field, { max = 10 } = {}) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const unique = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];

  if (unique.length === 0) {
    throw ApiError.badRequest(`El campo ${field} es obligatorio`, 'INVALID_INPUT', { field });
  }

  if (unique.length > max) {
    throw ApiError.badRequest(
      `No puedes seleccionar más de ${max} elementos en ${field}`,
      'INVALID_INPUT',
      { field },
    );
  }

  return unique.map((item) => requireUuid(item, field));
}

export function requireDate(value, field) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value.trim())) {
    throw ApiError.badRequest(`El campo ${field} debe usar el formato YYYY-MM-DD`, 'INVALID_INPUT', {
      field,
    });
  }

  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw ApiError.badRequest(`El campo ${field} no es una fecha válida`, 'INVALID_INPUT', { field });
  }

  return normalized;
}

export function requireDateTime(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw ApiError.badRequest(`El campo ${field} es obligatorio`, 'INVALID_INPUT', { field });
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(
      `El campo ${field} debe ser una fecha ISO 8601 válida`,
      'INVALID_INPUT',
      { field },
    );
  }

  return parsed.toISOString();
}

export function requireEmail(value, field = 'email') {
  const email = requireString(value, field, { min: 5, max: 254 }).toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw ApiError.badRequest(`El campo ${field} no es un correo válido`, 'INVALID_INPUT', { field });
  }

  return email;
}

export function optionalEmail(value, field = 'email') {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return requireEmail(value, field);
}

export function requireEnum(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw ApiError.badRequest(
      `El campo ${field} debe ser uno de: ${allowed.join(', ')}`,
      'INVALID_INPUT',
      { field, allowed },
    );
  }

  return value;
}

export function requireNumber(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw ApiError.badRequest(`El campo ${field} no es un número válido`, 'INVALID_INPUT', {
      field,
      min,
      max,
    });
  }

  return parsed;
}

export function requireInteger(value, field, options = {}) {
  const parsed = requireNumber(value, field, options);

  if (!Number.isInteger(parsed)) {
    throw ApiError.badRequest(`El campo ${field} debe ser un entero`, 'INVALID_INPUT', { field });
  }

  return parsed;
}

export function optionalBoolean(value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw ApiError.badRequest('El valor booleano no es válido', 'INVALID_INPUT');
}

export function parsePagination(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const offset = Math.max(Number(query.offset) || 0, 0);
  return { limit, offset };
}
