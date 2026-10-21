import { created, ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import {
  optionalString,
  optionalUuid,
  requireDateTime,
  requireEnum,
  requireNumber,
  requireUuid,
} from '../lib/validation.js';
import {
  APPOINTMENT_STATUSES,
  PAYMENT_METHODS,
  staffAppointmentPayload,
} from '../lib/payloads.js';
import { defaultAgendaRange } from '../lib/time.js';
import {
  cancelStaffAppointment,
  completeAppointment,
  createStaffAppointment,
  getAppointmentById,
  listAgenda,
  rescheduleStaffAppointment,
  setAppointmentStatus,
} from '../services/appointment.service.js';

function parseRange(query) {
  const fallback = defaultAgendaRange();
  const from = query.from ? requireDateTime(query.from, 'from') : fallback.from;
  const to = query.to ? requireDateTime(query.to, 'to') : fallback.to;

  if (new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return { from, to };
}

export async function listAppointments(req, res) {
  const { from, to } = parseRange(req.query);
  const barberId = optionalUuid(req.query.barberId, 'barberId');
  const status = req.query.status
    ? requireEnum(req.query.status, 'status', APPOINTMENT_STATUSES)
    : null;

  return ok(res, await listAgenda({ from, to, barberId, status, limit: 500 }));
}

export async function getAppointment(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await getAppointmentById(id));
}

export async function createAppointment(req, res) {
  const body = req.body ?? {};
  const appointment = await createStaffAppointment(staffAppointmentPayload(body), req.user.id);
  return created(res, appointment);
}

export async function updateStatus(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const status = requireEnum(body.status, 'status', ['confirmada', 'en_curso', 'no_asistio']);

  return ok(res, await setAppointmentStatus(id, status, req.user.id));
}

export async function cancelAppointment(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const reason = optionalString(body.reason, 'reason', { max: 500 });

  return ok(res, await cancelStaffAppointment(id, reason, req.user.id));
}

export async function rescheduleAppointment(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const startsAt = requireDateTime(body.startsAt, 'startsAt');

  return ok(res, await rescheduleStaffAppointment(id, startsAt, req.user.id));
}

export async function complete(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const method = requireEnum(body.method ?? 'efectivo', 'method', PAYMENT_METHODS);
  const amount =
    body.amount === undefined || body.amount === null
      ? null
      : requireNumber(body.amount, 'amount', { min: 1, max: 100_000_000 });
  const tip =
    body.tip === undefined || body.tip === null
      ? 0
      : requireNumber(body.tip, 'tip', { min: 0, max: 100_000_000 });

  return ok(res, await completeAppointment(id, { method, amount, tip }, req.user.id));
}
