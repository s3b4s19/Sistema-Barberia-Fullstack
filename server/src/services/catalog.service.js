import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../lib/errors.js';
import { usernameFromEmail } from '../lib/username.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

const PUBLIC_SETTINGS_COLUMNS = [
  'business_name',
  'legal_name',
  'phone',
  'email',
  'address',
  'city',
  'timezone',
  'currency',
  'locale',
  'phone_prefix',
  'slot_interval_min',
  'min_advance_min',
  'max_advance_days',
  'cancellation_hours',
  'deposit_percent',
  'tax_rate',
  'prices_include_tax',
  'instagram',
  'whatsapp',
  'maps_url',
  'logo_url',
].join(', ');

export async function getSettingsRow() {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.internal('La configuración del negocio no está inicializada');
  }

  return data;
}

export async function getPublicSettings() {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select(PUBLIC_SETTINGS_COLUMNS)
    .eq('id', 1)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.internal('La configuración del negocio no está inicializada');
  }

  return data;
}

export async function getPublicCatalog() {
  const [categoriesResult, servicesResult] = await Promise.all([
    supabaseAdmin
      .from('service_categories')
      .select('id, name, slug, description, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('services')
      .select(
        'id, category_id, name, slug, description, duration_min, buffer_min, price, image_url, sort_order',
      )
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);

  throwIf(categoriesResult.error);
  throwIf(servicesResult.error);

  return {
    categories: (categoriesResult.data ?? []).map((category) => ({
      ...category,
      services: (servicesResult.data ?? []).filter(
        (service) => service.category_id === category.id,
      ),
    })),
  };
}

export async function getPublicBarbers() {
  const { data, error } = await supabaseAdmin
    .from('barbers')
    .select(
      'id, display_name, bio, photo_url, accent_color, sort_order, barber_services(service_id, price_override, duration_override), barber_schedules(weekday, start_time, end_time, is_active)',
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  throwIf(error);

  return (data ?? []).map((barber) => ({
    id: barber.id,
    displayName: barber.display_name,
    bio: barber.bio,
    photoUrl: barber.photo_url,
    accentColor: barber.accent_color,
    sortOrder: barber.sort_order,
    services: barber.barber_services ?? [],
    schedules: (barber.barber_schedules ?? []).filter((schedule) => schedule.is_active),
  }));
}

// ---------------------------------------------------------------------------
// Servicios y categorías (admin)
// ---------------------------------------------------------------------------

export async function listServicesAdmin() {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('*, service_categories(id, name, slug)')
    .order('category_id', { ascending: true })
    .order('sort_order', { ascending: true });

  throwIf(error);
  return data ?? [];
}

export async function createService(input) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({
      category_id: input.categoryId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      duration_min: input.durationMin,
      buffer_min: input.bufferMin,
      price: input.price,
      image_url: input.imageUrl,
      is_active: input.isActive ?? true,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();

  throwIf(error);
  return data;
}

export async function updateService(id, input) {
  const payload = {};

  if (input.categoryId !== undefined) payload.category_id = input.categoryId;
  if (input.name !== undefined) payload.name = input.name;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.description !== undefined) payload.description = input.description;
  if (input.durationMin !== undefined) payload.duration_min = input.durationMin;
  if (input.bufferMin !== undefined) payload.buffer_min = input.bufferMin;
  if (input.price !== undefined) payload.price = input.price;
  if (input.imageUrl !== undefined) payload.image_url = input.imageUrl;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data, error } = await supabaseAdmin
    .from('services')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Servicio no encontrado', 'SERVICE_NOT_FOUND');
  }

  return data;
}

export async function deactivateService(id) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Servicio no encontrado', 'SERVICE_NOT_FOUND');
  }

  return data;
}

export async function listCategoriesAdmin() {
  const { data, error } = await supabaseAdmin
    .from('service_categories')
    .select('*')
    .order('sort_order', { ascending: true });

  throwIf(error);
  return data ?? [];
}

export async function createCategory(input) {
  const { data, error } = await supabaseAdmin
    .from('service_categories')
    .insert({
      name: input.name,
      slug: input.slug,
      description: input.description,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();

  throwIf(error);
  return data;
}

export async function updateCategory(id, input) {
  const payload = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.description !== undefined) payload.description = input.description;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data, error } = await supabaseAdmin
    .from('service_categories')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Categoría no encontrada', 'CATEGORY_NOT_FOUND');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Barberos (admin)
// ---------------------------------------------------------------------------

export async function listBarbersAdmin() {
  let result = await supabaseAdmin
    .from('barbers')
    .select(
      'id, profile_id, display_name, bio, photo_url, accent_color, commission_rate, sort_order, is_active, created_at, profiles!barbers_profile_id_fkey(full_name, phone, username, is_active)',
    )
    .order('sort_order', { ascending: true });

  if (result.error?.message?.includes('username')) {
    result = await supabaseAdmin
      .from('barbers')
      .select(
        'id, profile_id, display_name, bio, photo_url, accent_color, commission_rate, sort_order, is_active, created_at, profiles!barbers_profile_id_fkey(full_name, phone, is_active)',
      )
      .order('sort_order', { ascending: true });
  }

  throwIf(result.error);
  return result.data ?? [];
}

async function assertUsernameAvailable(username, excludeProfileId = null) {
  let query = supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('username', username);

  if (excludeProfileId) {
    query = query.neq('id', excludeProfileId);
  }

  const { data, error } = await query.maybeSingle();
  throwIf(error);

  if (data) {
    throw ApiError.conflict('Ese nombre de usuario ya está en uso', 'USERNAME_TAKEN', {
      field: 'username',
    });
  }
}

async function resolveCreateUsername(username, email) {
  if (username) {
    await assertUsernameAvailable(username);
    return username;
  }

  const base = usernameFromEmail(email);
  let candidate = base;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', candidate)
      .maybeSingle();

    throwIf(error);

    if (!data) {
      return candidate;
    }

    candidate = `${base.slice(0, 24)}.${Math.random().toString(36).slice(2, 6)}`;
  }

  throw ApiError.conflict('No se pudo asignar un nombre de usuario único', 'USERNAME_TAKEN', {
    field: 'username',
  });
}

async function createBarberAuthUser({ email, password, fullName }) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    if (error.code === 'email_exists') {
      throw ApiError.conflict('Ya existe un usuario con ese correo', 'EMAIL_EXISTS');
    }

    if (error.code === 'weak_password') {
      throw ApiError.badRequest('La contraseña es demasiado débil', 'WEAK_PASSWORD');
    }

    throw ApiError.badRequest(error.message, 'AUTH_USER_ERROR');
  }

  return data.user;
}

export async function createBarber(input) {
  const username = await resolveCreateUsername(input.username, input.email);
  const user = await createBarberAuthUser(input);

  try {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'barbero',
        full_name: input.fullName,
        phone: input.phone ?? null,
        username,
        is_active: true,
      })
      .eq('id', user.id);

    throwIf(profileError);

    const { data, error } = await supabaseAdmin
      .from('barbers')
      .insert({
        profile_id: user.id,
        display_name: input.displayName,
        bio: input.bio ?? null,
        photo_url: input.photoUrl ?? null,
        accent_color: input.accentColor ?? '#3f4a5a',
        commission_rate: input.commissionRate ?? 0,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      })
      .select()
      .single();

    throwIf(error);
    return { ...data, email: input.email, username };
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(user.id).catch(() => {});
    throw error;
  }
}

export async function updateBarber(id, input) {
  const payload = {};

  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.bio !== undefined) payload.bio = input.bio;
  if (input.photoUrl !== undefined) payload.photo_url = input.photoUrl;
  if (input.accentColor !== undefined) payload.accent_color = input.accentColor;
  if (input.commissionRate !== undefined) payload.commission_rate = input.commissionRate;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from('barbers')
    .select('id, profile_id, is_active')
    .eq('id', id)
    .maybeSingle();

  throwIf(currentError);

  if (!current) {
    throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
  }

  if (input.isActive === false && current.is_active) {
    const { count, error: countError } = await supabaseAdmin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('barber_id', id)
      .in('status', ['pendiente', 'confirmada', 'en_curso']);

    throwIf(countError);

    if ((count ?? 0) > 0) {
      throw ApiError.conflict(
        'El barbero tiene citas activas. Reasígnalas o cancélalas antes de desactivarlo.',
        'BARBER_HAS_APPOINTMENTS',
      );
    }
  }

  if (input.username !== undefined && input.username) {
    await assertUsernameAvailable(input.username, current.profile_id);
  }

  const { data, error } = await supabaseAdmin
    .from('barbers')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
  }

  const profilePayload = {};

  if (input.isActive !== undefined) {
    profilePayload.is_active = input.isActive;
  }

  if (input.username !== undefined) {
    profilePayload.username = input.username;
  }

  if (Object.keys(profilePayload).length > 0) {
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update(profilePayload)
      .eq('id', current.profile_id);

    throwIf(profileError);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Horarios y bloqueos
// ---------------------------------------------------------------------------

export async function getBarberSchedules(barberId) {
  const { data: barber, error: barberError } = await supabaseAdmin
    .from('barbers')
    .select('id')
    .eq('id', barberId)
    .maybeSingle();

  throwIf(barberError);

  if (!barber) {
    throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
  }

  const { data, error } = await supabaseAdmin
    .from('barber_schedules')
    .select('*')
    .eq('barber_id', barberId)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });

  throwIf(error);
  return data ?? [];
}

export async function replaceBarberSchedules(barberId, schedules) {
  const { data: barber, error: barberError } = await supabaseAdmin
    .from('barbers')
    .select('id')
    .eq('id', barberId)
    .maybeSingle();

  throwIf(barberError);

  if (!barber) {
    throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
  }

  const { error: deleteError } = await supabaseAdmin
    .from('barber_schedules')
    .delete()
    .eq('barber_id', barberId);

  throwIf(deleteError);

  if (schedules.length === 0) {
    return [];
  }

  const rows = schedules.map((schedule) => ({
    barber_id: barberId,
    weekday: schedule.weekday,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    is_active: schedule.isActive ?? true,
  }));

  const { data, error } = await supabaseAdmin
    .from('barber_schedules')
    .insert(rows)
    .select();

  throwIf(error);
  return data ?? [];
}

export async function listTimeOff({ barberId = null, from = null, to = null } = {}) {
  let query = supabaseAdmin
    .from('time_off')
    .select('*, barbers(display_name)')
    .order('starts_at', { ascending: true });

  if (barberId) {
    query = query.or(`barber_id.eq.${barberId},barber_id.is.null`);
  }

  if (from) {
    query = query.gte('ends_at', from);
  }

  if (to) {
    query = query.lte('starts_at', to);
  }

  const { data, error } = await query;
  throwIf(error);
  return data ?? [];
}

export async function createTimeOff(input) {
  if (input.barberId) {
    const { data: barber, error } = await supabaseAdmin
      .from('barbers')
      .select('id')
      .eq('id', input.barberId)
      .maybeSingle();

    throwIf(error);

    if (!barber) {
      throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
    }
  }

  const { data, error } = await supabaseAdmin
    .from('time_off')
    .insert({
      barber_id: input.barberId ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      reason: input.reason ?? null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();

  throwIf(error);
  return data;
}

export async function deleteTimeOff(id) {
  const { data, error } = await supabaseAdmin
    .from('time_off')
    .delete()
    .eq('id', id)
    .select('id');

  throwIf(error);

  if (!data || data.length === 0) {
    throw ApiError.notFound('Bloqueo no encontrado', 'TIME_OFF_NOT_FOUND');
  }

  return { id };
}

export async function getTimeOffById(id) {
  const { data, error } = await supabaseAdmin
    .from('time_off')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Bloqueo no encontrado', 'TIME_OFF_NOT_FOUND');
  }

  return data;
}

// ---------------------------------------------------------------------------
// Servicios por barbero
// ---------------------------------------------------------------------------

async function assertBarberExists(barberId) {
  const { data, error } = await supabaseAdmin
    .from('barbers')
    .select('id')
    .eq('id', barberId)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Barbero no encontrado', 'BARBER_NOT_FOUND');
  }
}

export async function getBarberServices(barberId) {
  await assertBarberExists(barberId);

  const { data, error } = await supabaseAdmin
    .from('barber_services')
    .select(
      'service_id, price_override, duration_override, created_at, services(name, slug, price, duration_min, is_active)',
    )
    .eq('barber_id', barberId);

  throwIf(error);
  return data ?? [];
}

export async function replaceBarberServices(barberId, items) {
  await assertBarberExists(barberId);

  if (items.length > 0) {
    const ids = items.map((item) => item.serviceId);
    const { data: services, error } = await supabaseAdmin
      .from('services')
      .select('id')
      .in('id', ids)
      .eq('is_active', true);

    throwIf(error);

    if ((services ?? []).length !== ids.length) {
      throw ApiError.badRequest(
        'Uno o más servicios no existen o están inactivos',
        'INVALID_SERVICES',
      );
    }
  }

  const { error: deleteError } = await supabaseAdmin
    .from('barber_services')
    .delete()
    .eq('barber_id', barberId);

  throwIf(deleteError);

  if (items.length > 0) {
    const rows = items.map((item) => ({
      barber_id: barberId,
      service_id: item.serviceId,
      price_override: item.priceOverride,
      duration_override: item.durationOverride,
    }));

    const { error } = await supabaseAdmin.from('barber_services').insert(rows);
    throwIf(error);
  }

  return getBarberServices(barberId);
}
