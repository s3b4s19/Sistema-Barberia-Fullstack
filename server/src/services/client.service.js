import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../lib/errors.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

export async function listClients({ search = null, limit = 50, offset = 0 } = {}) {
  let query = supabaseAdmin
    .from('clients')
    .select('id, full_name, phone, email, birth_date, notes, marketing_consent, is_active, last_visit_at, created_at', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    const safe = search.replace(/[%_,()]/g, ' ').trim();

    if (safe) {
      query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
  }

  const { data, error, count } = await query;
  throwIf(error);

  return {
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getClientById(id) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Cliente no encontrado', 'CLIENT_NOT_FOUND');
  }

  return data;
}

export async function getClientHistory(id) {
  const { data, error } = await supabaseAdmin
    .from('v_client_history')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Cliente no encontrado', 'CLIENT_NOT_FOUND');
  }

  return data;
}

export async function listClientAppointments({
  clientId,
  from = null,
  to = null,
  limit = 20,
  offset = 0,
} = {}) {
  await getClientById(clientId);

  let query = supabaseAdmin
    .from('v_agenda')
    .select('*', { count: 'exact' })
    .eq('client_id', clientId)
    .order('starts_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (from) {
    query = query.gte('starts_at', from);
  }

  if (to) {
    query = query.lt('starts_at', to);
  }

  const { data, error, count } = await query;
  throwIf(error);

  return {
    items: data ?? [],
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function createClient(input) {
  const { data, error } = await supabaseAdmin
    .from('clients')
    .insert({
      full_name: input.fullName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      birth_date: input.birthDate ?? null,
      notes: input.notes ?? null,
      marketing_consent: input.marketingConsent ?? false,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();

  throwIf(error);
  return data;
}

export async function updateClient(id, input) {
  const payload = {};

  if (input.fullName !== undefined) payload.full_name = input.fullName;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.email !== undefined) payload.email = input.email;
  if (input.birthDate !== undefined) payload.birth_date = input.birthDate;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.marketingConsent !== undefined) payload.marketing_consent = input.marketingConsent;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data, error } = await supabaseAdmin
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Cliente no encontrado', 'CLIENT_NOT_FOUND');
  }

  return data;
}

export async function listBarberClients(barberId, { limit = 100 } = {}) {
  const { data: appointments, error: appointmentError } = await supabaseAdmin
    .from('appointments')
    .select('client_id')
    .eq('barber_id', barberId)
    .order('starts_at', { ascending: false })
    .limit(1000);

  throwIf(appointmentError);

  const ids = [...new Set((appointments ?? []).map((row) => row.client_id))].slice(0, limit);

  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, phone, email, last_visit_at, is_active')
    .in('id', ids)
    .order('full_name', { ascending: true });

  throwIf(error);
  return data ?? [];
}
