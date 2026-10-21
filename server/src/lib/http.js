export function camelize(value) {
  if (Array.isArray(value)) {
    return value.map(camelize);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase()),
        camelize(nested),
      ]),
    );
  }

  return value;
}

export function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data: camelize(data) });
}

export function created(res, data) {
  return ok(res, data, 201);
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req, res) {
  return res.status(404).json({
    ok: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `La ruta ${req.method} ${req.originalUrl} no existe`,
      details: null,
    },
  });
}
