import { ApiError } from './errors.js';
import { requireString } from './validation.js';

/**
 * Normaliza teléfonos chilenos e internacionales al formato E.164.
 * Acepta: +56912345678, 56912345678, 912345678, 9 1234 5678.
 */
export function normalizePhone(value, field = 'phone') {
  const raw = requireString(value, field, { min: 6, max: 30 });
  let digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('00')) {
    digits = `+${digits.slice(2)}`;
  }

  if (!digits.startsWith('+')) {
    if (digits.startsWith('56')) {
      digits = `+${digits}`;
    } else if (digits.length === 9 && digits.startsWith('9')) {
      digits = `+56${digits}`;
    } else {
      digits = `+${digits}`;
    }
  }

  const normalized = `+${digits.slice(1).replace(/\D/g, '')}`;

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw ApiError.badRequest('El teléfono no es válido', 'INVALID_PHONE', { field });
  }

  return normalized;
}
