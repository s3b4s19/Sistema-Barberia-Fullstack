const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 60_000).unref();

export function rateLimit({ windowMs = 60_000, max = 60, prefix = 'global' } = {}) {
  return (req, res, next) => {
    const key = `${prefix}:${req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(max - bucket.count, 0);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        ok: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
          details: null,
        },
      });
    }

    return next();
  };
}
