import { ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import { parsePagination, requireDateTime } from '../lib/validation.js';
import { defaultMetricsRange } from '../lib/time.js';
import { getDashboard } from '../services/dashboard.service.js';
import { listAuditLog } from '../services/audit.service.js';

export async function dashboard(req, res) {
  const fallback = defaultMetricsRange();
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : fallback.from;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : fallback.to;

  if (new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return ok(res, await getDashboard({ from, to }));
}

export async function audit(req, res) {
  const { limit } = parsePagination({ limit: req.query.limit ?? 100 });
  return ok(res, await listAuditLog({ limit }));
}
