import { created, ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import {
  optionalUuid,
  parsePagination,
  parseUuidList,
  requireDate,
  requireDateTime,
  requireString,
  requireUuid,
} from '../lib/validation.js';
import { normalizePhone } from '../lib/phone.js';
import { guestAppointmentPayload, reviewPayload } from '../lib/payloads.js';
import {
  cancelAppointmentByCode,
  createGuestAppointment,
  getAvailability,
  lookupAppointment,
  rescheduleAppointmentByCode,
} from '../services/appointment.service.js';
import {
  getDayAvailability,
  getPublicHours,
} from '../services/availability.service.js';
import {
  getPublicBarbers,
  getPublicCatalog,
  getPublicSettings,
  getSettingsRow,
} from '../services/catalog.service.js';
import {
  createReview as submitReview,
  listPublicReviews,
} from '../services/review.service.js';

function parseAppointmentCode(value) {
  const code = requireString(value, 'code', { min: 4, max: 30 }).toUpperCase();

  if (!/^[A-Z0-9-]+$/.test(code)) {
    throw ApiError.badRequest('El código de la cita no es válido', 'INVALID_CODE');
  }

  return code;
}

function publicAppointment(row) {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    subtotal: row.subtotal,
    discount: row.discount,
    taxAmount: row.tax_amount,
    total: row.total,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function health(_req, res) {
  return ok(res, { status: 'ok', timestamp: new Date().toISOString() });
}

export async function publicSettings(_req, res) {
  return ok(res, await getPublicSettings());
}

export async function publicServices(_req, res) {
  return ok(res, await getPublicCatalog());
}

export async function publicBarbers(_req, res) {
  return ok(res, await getPublicBarbers());
}

export async function publicHours(_req, res) {
  return ok(res, await getPublicHours());
}

export async function availabilityDay(req, res) {
  const date = requireDate(req.query.date, 'date');
  const serviceId = requireUuid(req.query.serviceId, 'serviceId');
  const rawBarberId = req.query.barberId;
  const barberId =
    rawBarberId === undefined || rawBarberId === '' || rawBarberId === 'any'
      ? null
      : requireUuid(rawBarberId, 'barberId');

  return ok(res, await getDayAvailability({ date, serviceId, barberId }));
}

export async function availability(req, res) {
  const barberId = req.query.barberId;
  const date = requireDate(req.query.date, 'date');
  const serviceIds = req.query.serviceIds;

  const settings = await getSettingsRow();
  const slots = await getAvailability({
    barberId: requireUuid(barberId, 'barberId'),
    date,
    serviceIds: parseUuidList(serviceIds, 'serviceIds'),
  });

  return ok(res, {
    date,
    timeZone: settings.timezone,
    slots,
  });
}

export async function createAppointment(req, res) {
  const body = req.body ?? {};

  // Honeypot: los bots completan este campo oculto.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return created(res, { received: true });
  }

  const appointment = await createGuestAppointment(guestAppointmentPayload(body));
  return created(res, publicAppointment(appointment));
}

export async function getAppointment(req, res) {
  const code = parseAppointmentCode(req.params.code);
  const phone = normalizePhone(req.query.phone);

  return ok(res, await lookupAppointment(code, phone));
}

export async function cancelAppointment(req, res) {
  const body = req.body ?? {};
  const code = parseAppointmentCode(req.params.code);
  const phone = normalizePhone(body.phone);
  const reason = body.reason ?? null;

  return ok(res, await cancelAppointmentByCode(code, phone, reason));
}

export async function rescheduleAppointment(req, res) {
  const body = req.body ?? {};
  const code = parseAppointmentCode(req.params.code);
  const phone = normalizePhone(body.phone);
  const startsAt = requireDateTime(body.startsAt, 'startsAt');

  return ok(res, publicAppointment(await rescheduleAppointmentByCode(code, phone, startsAt)));
}

export async function reviews(req, res) {
  const barberId = optionalUuid(req.query.barberId, 'barberId');
  const { limit } = parsePagination({ limit: req.query.limit ?? 20 });

  return ok(res, await listPublicReviews({ barberId, limit }));
}

export async function createReview(req, res) {
  return created(res, await submitReview(reviewPayload(req.body ?? {})));
}
