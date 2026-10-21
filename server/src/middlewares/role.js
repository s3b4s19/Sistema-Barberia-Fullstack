import { ApiError } from '../lib/errors.js';

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Tu rol no permite esta operación'));
    }

    return next();
  };
}
