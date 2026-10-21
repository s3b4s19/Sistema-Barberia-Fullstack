import { ApiError } from './errors.js';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,29}$/;

export function normalizeUsername(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw ApiError.badRequest('El nombre de usuario es obligatorio', 'INVALID_USERNAME', {
        field: 'username',
      });
    }

    return null;
  }

  const username = String(value).trim().toLowerCase();

  if (!USERNAME_PATTERN.test(username)) {
    throw ApiError.badRequest(
      'El usuario debe tener entre 3 y 30 caracteres y usar minúsculas, números, punto, guion o guion bajo',
      'INVALID_USERNAME',
      { field: 'username' },
    );
  }

  return username;
}

export function usernameFromEmail(email) {
  const base = String(email ?? '')
    .split('@')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 30);

  return USERNAME_PATTERN.test(base) ? base : 'staff';
}

export function looksLikeEmail(value) {
  return String(value ?? '').includes('@');
}
