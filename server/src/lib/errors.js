export class ApiError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details = null) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Debes iniciar sesión') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'No tienes permisos para esta operación') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Recurso no encontrado', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = 'CONFLICT', details = null) {
    return new ApiError(409, code, message, details);
  }

  static internal(message = 'Error interno del servidor') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}
