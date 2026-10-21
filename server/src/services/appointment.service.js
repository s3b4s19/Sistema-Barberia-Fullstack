import { supabaseAdmin } from '../config/supabase.js';
import { recordAudit } from '../lib/audit.js';
import { ApiError } from '../lib/errors.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

function single(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function getAvailability({ barberId, date, serviceIds }) {
  const { data, error } = await supabaseAdmin.rpc('get_available_slots', {
    p_barber_id: barberId,
    p_date: date,
    p_service_ids: serviceIds,
    p_exclude_appointment: null,
  });

  throwIf(error);
  return data ?? [];
}

export async function createGuestAppointment(input) {
  const { data, error } = await supabaseAdmin.rpc('book_appointment', {
    p_barber_id: input.barberId,
    p_service_ids: input.serviceIds,
    p_starts_at: input.startsAt,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_email: input.email ?? null,
    p_notes: input.notes ?? null,
    p_source: 'web',
    p_created_by: null,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo crear la cita');
  }

  return appointment;
}

export async function lookupAppointment(code, phone) {
  const { data, error } = await supabaseAdmin.rpc('lookup_appointment', {
    p_code: code,
    p_phone: phone,
  });

  throwIf(error);

  if (!data) {
    throw ApiError.notFound(
      'No encontramos una cita con ese código y teléfono',
      'APPOINTMENT_NOT_FOUND',
    );
  }

  return data;
}

export async function cancelAppointmentByCode(code, phone, reason) {
  const { data, error } = await supabaseAdmin.rpc('cancel_appointment_by_code', {
    p_code: code,
    p_phone: phone,
    p_reason: reason ?? null,
  });

  throwIf(error);
  return data;
}

export async function rescheduleAppointmentByCode(code, phone, startsAt) {
  const { data, error } = await supabaseAdmin.rpc('reschedule_appointment_by_code', {
    p_code: code,
    p_phone: phone,
    p_starts_at: startsAt,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo reprogramar la cita');
  }

  return appointment;
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function listAgenda({ from, to, barberId = null, status = null, limit = 500 }) {
  let query = supabaseAdmin
    .from('v_agenda')
    .select('*')
    .gte('starts_at', from)
    .lt('starts_at', to)
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (barberId) {
    query = query.eq('barber_id', barberId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  throwIf(error);
  return data ?? [];
}

export async function getAppointmentById(id) {
  const { data, error } = await supabaseAdmin
    .from('v_agenda')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Cita no encontrada', 'APPOINTMENT_NOT_FOUND');
  }

  const { data: payments, error: paymentError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('appointment_id', id)
    .order('paid_at', { ascending: false });

  throwIf(paymentError);

  return { ...data, payments: payments ?? [] };
}

export async function createStaffAppointment(input, actorId) {
  const { data, error } = await supabaseAdmin.rpc('book_appointment', {
    p_barber_id: input.barberId,
    p_service_ids: input.serviceIds,
    p_starts_at: input.startsAt,
    p_full_name: input.fullName,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_notes: input.notes ?? null,
    p_source: input.source ?? 'mostrador',
    p_created_by: actorId,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo crear la cita');
  }

  await recordAudit({
    actorId,
    action: 'appointment.create',
    entity: 'appointments',
    entityId: appointment.id,
    after: appointment,
  });

  return appointment;
}

export async function cancelStaffAppointment(id, reason, actorId) {
  const { data, error } = await supabaseAdmin.rpc('cancel_appointment', {
    p_appointment_id: id,
    p_reason: reason ?? null,
    p_actor: actorId,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo cancelar la cita');
  }

  await recordAudit({
    actorId,
    action: 'appointment.cancel',
    entity: 'appointments',
    entityId: id,
    after: appointment,
  });

  return appointment;
}

export async function rescheduleStaffAppointment(id, startsAt, actorId) {
  const { data, error } = await supabaseAdmin.rpc('reschedule_appointment', {
    p_appointment_id: id,
    p_starts_at: startsAt,
    p_actor: actorId,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo reprogramar la cita');
  }

  await recordAudit({
    actorId,
    action: 'appointment.reschedule',
    entity: 'appointments',
    entityId: id,
    after: appointment,
  });

  return appointment;
}

export async function setAppointmentStatus(id, status, actorId) {
  const { data, error } = await supabaseAdmin.rpc('set_appointment_status', {
    p_appointment_id: id,
    p_status: status,
    p_actor: actorId,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo actualizar la cita');
  }

  await recordAudit({
    actorId,
    action: `appointment.status.${status}`,
    entity: 'appointments',
    entityId: id,
    after: appointment,
  });

  return appointment;
}

export async function completeAppointment(id, { method, amount = null, tip = 0 }, actorId) {
  const { data, error } = await supabaseAdmin.rpc('complete_appointment', {
    p_appointment_id: id,
    p_method: method,
    p_amount: amount,
    p_tip: tip,
    p_actor: actorId,
  });

  throwIf(error);

  const appointment = single(data);

  if (!appointment) {
    throw ApiError.internal('No se pudo completar la cita');
  }

  await recordAudit({
    actorId,
    action: 'appointment.complete',
    entity: 'appointments',
    entityId: id,
    after: appointment,
  });

  return appointment;
}
