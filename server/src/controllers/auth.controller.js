import { ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import { requireString } from '../lib/validation.js';
import { changePassword, getMe, login, logout, refresh } from '../services/auth.service.js';

export async function loginHandler(req, res) {
  const body = req.body ?? {};
  const identifier = requireString(
    body.identifier ?? body.email,
    'identifier',
    { min: 3, max: 254 },
  );
  const password = requireString(body.password, 'password', { min: 8, max: 128 });

  return ok(res, await login(identifier, password));
}

export async function refreshHandler(req, res) {
  const body = req.body ?? {};
  const refreshToken = requireString(body.refreshToken, 'refreshToken', { min: 10, max: 4096 });

  return ok(res, await refresh(refreshToken));
}

export async function logoutHandler(req, res) {
  return ok(res, await logout(req.token));
}

export async function meHandler(req, res) {
  return ok(res, await getMe(req.user.id));
}

export async function changePasswordHandler(req, res) {
  const body = req.body ?? {};
  const currentPassword = requireString(body.currentPassword, 'currentPassword', {
    min: 8,
    max: 128,
  });
  const newPassword = requireString(body.newPassword, 'newPassword', {
    min: 8,
    max: 128,
  });

  if (currentPassword === newPassword) {
    throw ApiError.badRequest(
      'La nueva contraseña debe ser distinta a la actual',
      'SAME_PASSWORD',
      { field: 'newPassword' },
    );
  }

  return ok(res, await changePassword(req.user, currentPassword, newPassword));
}
