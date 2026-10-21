import { created, ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import { requireDateTime, requireUuid } from '../lib/validation.js';
import {
  barberCreatePayload,
  barberServicesPayload,
  barberUpdatePayload,
  categoryPayload,
  schedulesPayload,
  servicePayload,
  timeOffPayload,
} from '../lib/payloads.js';
import {
  createBarber,
  createCategory,
  createService,
  createTimeOff,
  deactivateService,
  deleteTimeOff,
  getBarberSchedules,
  getBarberServices,
  listBarbersAdmin,
  listCategoriesAdmin,
  listServicesAdmin,
  listTimeOff,
  replaceBarberSchedules,
  replaceBarberServices as setBarberServices,
  updateBarber,
  updateCategory,
  updateService,
} from '../services/catalog.service.js';

// ---------------------------------------------------------------------------
// Servicios
// ---------------------------------------------------------------------------

export async function services(_req, res) {
  return ok(res, await listServicesAdmin());
}

export async function createServiceHandler(req, res) {
  return created(res, await createService(servicePayload(req.body ?? {})));
}

export async function updateServiceHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await updateService(id, servicePayload(req.body ?? {}, { partial: true })));
}

export async function deleteServiceHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await deactivateService(id));
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export async function categories(_req, res) {
  return ok(res, await listCategoriesAdmin());
}

export async function createCategoryHandler(req, res) {
  return created(res, await createCategory(categoryPayload(req.body ?? {})));
}

export async function updateCategoryHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await updateCategory(id, categoryPayload(req.body ?? {}, { partial: true })));
}

// ---------------------------------------------------------------------------
// Barberos y horarios
// ---------------------------------------------------------------------------

export async function barbers(_req, res) {
  return ok(res, await listBarbersAdmin());
}

export async function createBarberHandler(req, res) {
  return created(res, await createBarber(barberCreatePayload(req.body ?? {})));
}

export async function updateBarberHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await updateBarber(id, barberUpdatePayload(req.body ?? {})));
}

export async function schedules(req, res) {
  const barberId = requireUuid(req.params.barberId, 'barberId');
  return ok(res, await getBarberSchedules(barberId));
}

export async function replaceSchedules(req, res) {
  const barberId = requireUuid(req.params.barberId, 'barberId');
  const parsed = schedulesPayload(req.body ?? {});
  return ok(res, await replaceBarberSchedules(barberId, parsed));
}

export async function barberServices(req, res) {
  const barberId = requireUuid(req.params.barberId, 'barberId');
  return ok(res, await getBarberServices(barberId));
}

export async function replaceBarberServices(req, res) {
  const barberId = requireUuid(req.params.barberId, 'barberId');
  const services = barberServicesPayload(req.body ?? {});
  return ok(res, await setBarberServices(barberId, services));
}

// ---------------------------------------------------------------------------
// Bloqueos
// ---------------------------------------------------------------------------

export async function timeOff(req, res) {
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : null;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : null;

  if (from && to && new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return ok(res, await listTimeOff({ from, to }));
}

export async function createTimeOffHandler(req, res) {
  const parsed = timeOffPayload(req.body ?? {});
  return created(res, await createTimeOff({ ...parsed, createdBy: req.user.id }));
}

export async function deleteTimeOffHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await deleteTimeOff(id));
}
