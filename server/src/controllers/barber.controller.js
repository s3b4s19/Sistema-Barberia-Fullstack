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
import { PAYMENT_METHODS, staffAppointmentPayload, timeOffPayload } from '../lib/payloads.js';
import { defaultAgendaRange } from '../lib/time.js';
import {
  createTimeOff,
  deleteTimeOff,
  getTimeOffById,
  listTimeOff,
} from '../services/catalog.service.js';
import { listBarberClients } from '../services/client.service.js';
import {
  cancelStaffAppointment,
  completeAppointment,
  createStaffAppointment,
  getAppointmentById,
  listAgenda,
  setAppointmentStatus,
} from '../services/appointment.service.js';

function resolveBarberId(req, fallback = null) {
  if (req.user.role === 'barbero') {
    if (!req.user.barberId) {
      throw ApiError.forbidden('El usuario no tiene ficha de barbero');
    }

    return req.user.barberId;
  }

  const barberId = fallback ?? optionalUuid(req.query.barberId, 'barberId');

  if (!barberId) {
    throw ApiError.badRequest('El campo barberId es obligatorio para administradores');
  }

  return barberId;
}

export async function agenda(req, res) {
  const barberId = resolveBarberId(req);
  const fallback = defaultAgendaRange();
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : fallback.from;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : fallback.to;

  if (new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return ok(res, await listAgenda({ from, to, barberId, limit: 500 }));
}

export async function clients(req, res) {
  const barberId = resolveBarberId(req);
  return ok(res, await listBarberClients(barberId));
}

export async function timeOffList(req, res) {
  const barberId = resolveBarberId(req);
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : null;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : null;

  if (from && to && new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return ok(res, await listTimeOff({ barberId, from, to }));
}

export async function createTimeOffHandler(req, res) {
  const parsed = timeOffPayload(req.body ?? {});
  const barberId = resolveBarberId(req, parsed.barberId);

  return created(
    res,
    await createTimeOff({ ...parsed, barberId, createdBy: req.user.id }),
  );
}

export async function deleteTimeOffHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  const barberId = resolveBarberId(req);
  const timeOff = await getTimeOffById(id);

  if (timeOff.barber_id !== barberId) {
    throw ApiError.forbidden('No puedes eliminar un bloqueo de otro barbero');
  }

  return ok(res, await deleteTimeOff(id));
}

async function assertOwnAppointment(id, barberId) {
  const appointment = await getAppointmentById(id);

  if (appointment.barber_id !== barberId) {
    throw ApiError.forbidden('No puedes operar sobre la cita de otro barbero');
  }

  return appointment;
}

export async function getAppointment(req, res) {
  const id = requireUuid(req.params.id, 'id');
  const barberId = resolveBarberId(req);
  await assertOwnAppointment(id, barberId);
  return ok(res, await getAppointmentById(id));
}

export async function createAppointment(req, res) {
  const body = req.body ?? {};
  const payload = {
    ...body,
    barberId: req.user.role === 'barbero' ? req.user.barberId : body.barberId,
  };

  const parsed = staffAppointmentPayload(payload);
  const barberId = resolveBarberId(req, parsed.barberId);

  return created(
    res,
    await createStaffAppointment({ ...parsed, barberId }, req.user.id),
  );
}

export async function updateStatus(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const barberId = resolveBarberId(req);
  await assertOwnAppointment(id, barberId);

  const status = requireEnum(body.status, 'status', ['confirmada', 'en_curso', 'no_asistio']);
  return ok(res, await setAppointmentStatus(id, status, req.user.id));
}

export async function cancelAppointment(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const barberId = resolveBarberId(req);
  await assertOwnAppointment(id, barberId);

  const reason = optionalString(body.reason, 'reason', { max: 500 });
  return ok(res, await cancelStaffAppointment(id, reason, req.user.id));
}

export async function complete(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const barberId = resolveBarberId(req);
  await assertOwnAppointment(id, barberId);

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

