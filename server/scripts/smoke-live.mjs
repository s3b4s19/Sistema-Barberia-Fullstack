#!/usr/bin/env node
/**
 * Validación funcional contra el proyecto Supabase real.
 *
 * - Crea un administrador temporal solo para autenticar las llamadas.
 * - Todas las operaciones de negocio pasan por la API HTTP.
 * - Deja a John y los datos de demostración listos para el frontend.
 * - Restaura el stock y elimina el bloqueo temporal al terminar.
 *
 * Uso:
 *   node scripts/smoke-live.mjs
 *
 * Requisitos:
 *   - API escuchando en http://localhost:4000/api
 *   - server/.env con SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY
 */

import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env.js';
import { addDaysToDate, todayInTimeZone, zonedDateStart } from '../src/lib/time.js';

const rawBase = (process.env.SMOKE_BASE_URL ?? `http://localhost:${env.port}/api`).replace(
  /\/+$/,
  '',
);
const baseUrl = rawBase.endsWith('/api') ? rawBase : `${rawBase}/api`;

const credentialsPath = fileURLToPath(new URL('../.test-credentials.json', import.meta.url));
const reportPath = fileURLToPath(new URL('../../docs/qa-live.md', import.meta.url));

const JOHN_EMAIL = 'john.barbero@barberia.test';
const JOHN_PHONE = '+56900000001';
const JOHN_FULL_NAME = 'John Pérez Muñoz';

const CLIENT_ONE = {
  fullName: 'Cliente de Prueba',
  phone: '+56900000002',
  email: 'cliente.prueba@example.com',
};

const CLIENT_TWO = {
  fullName: 'Cliente Solapamiento',
  phone: '+56900000003',
  email: 'solapamiento@example.com',
};

const TEST_SETTINGS = {
  businessName: 'Barbería John',
  legalName: 'Barbería John SpA',
  phone: '+56220000000',
  email: 'contacto@barberiajohn.test',
  address: 'Av. Providencia 1234, Local 5',
  city: 'Santiago',
  timezone: 'America/Santiago',
  currency: 'CLP',
  locale: 'es-CL',
  phonePrefix: '+56',
  slotIntervalMin: 15,
  minAdvanceMin: 60,
  maxAdvanceDays: 60,
  cancellationHours: 12,
  depositPercent: 0,
  taxRate: 19,
  pricesIncludeTax: true,
  instagram: '@barberiajohn.test',
  whatsapp: '+56900000000',
  mapsUrl: 'https://maps.google.com/?q=Providencia,Santiago,Chile',
};

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

const checks = [];
let mainError = null;
let tempAdmin = null;
let adminToken = null;
let johnPassword = null;
let johnBarberId = null;
let timeOffId = null;
let stockRestore = null;
let appointmentOne = null;
let serviceIds = null;
let reviewId = null;
let usedSummary = {};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sameInstant(left, right) {
  return new Date(left).getTime() === new Date(right).getTime();
}

function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

async function api(method, route, { token = null, body = undefined } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { status: response.status, ok: response.ok, json };
}

function expectStatus(result, expected, label) {
  const statuses = Array.isArray(expected) ? expected : [expected];

  if (!statuses.includes(result.status)) {
    const error = result.json?.error;
    throw new Error(
      `${label}: HTTP ${result.status}${error ? ` (${error.code}: ${error.message})` : ''}`,
    );
  }

  return result.json?.data;
}

async function check(name, fn) {
  const startedAt = Date.now();

  try {
    const detail = await fn();
    const text = detail === undefined || detail === null ? '' : String(detail);
    checks.push({ name, ok: true, detail: text, ms: Date.now() - startedAt });
    console.log(`OK    ${name}${text ? ` -> ${text}` : ''}`);
    return detail;
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message, ms: Date.now() - startedAt });
    console.log(`FALLO ${name} -> ${error.message}`);
    throw error;
  }
}

async function login(email, password) {
  const response = await api('POST', '/auth/login', {
    body: { email, password },
  });
  const data = expectStatus(response, 200, `Login ${email}`);
  assert(data?.accessToken, 'La respuesta de login no incluye accessToken');
  return data;
}

async function findAuthUserByEmail(email) {
  const target = email.toLowerCase();

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });

    if (error) {
      throw new Error(`No se pudo listar usuarios de Auth: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === target);

    if (found) {
      return found;
    }

    if (data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

async function createTempAdmin() {
  const email = `qa.smoke.${Date.now().toString(36)}@barberia.test`;
  const password = randomBytes(24).toString('base64url');

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'QA Smoke Admin' },
  });

  if (error) {
    throw new Error(`No se pudo crear el administrador temporal: ${error.message}`);
  }

  const userId = data.user.id;

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          role: 'admin',
          full_name: 'QA Smoke Admin',
          is_active: true,
        },
        { onConflict: 'id' },
      )
      .select('id, role')
      .single();

    if (profileError || !profile) {
      throw new Error(
        `No se pudo preparar el perfil del administrador temporal: ${profileError?.message ?? 'sin datos'}`,
      );
    }
  } catch (error) {
    await supabase.auth.admin.deleteUser(userId).catch(() => {});
    throw error;
  }

  return { userId, email, password };
}

async function ensureJohn() {
  const existing = await findAuthUserByEmail(JOHN_EMAIL);
  const password = randomBytes(24).toString('base64url');

  if (!existing) {
    const response = await api('POST', '/admin/barbers', {
      token: adminToken,
      body: {
        email: JOHN_EMAIL,
        password,
        fullName: JOHN_FULL_NAME,
        displayName: 'John',
        phone: JOHN_PHONE,
        bio: 'Barbero de prueba especializado en cortes clásicos y perfilado de barba.',
        accentColor: '#3f4a5a',
        commissionRate: 40,
        sortOrder: 1,
        isActive: true,
      },
    });

    const data = expectStatus(response, 201, 'Crear barbero John');
    assert(data?.id, 'La API no devolvió el id del barbero John');
    johnPassword = password;
    return { created: true, barberId: data.id, password };
  }

  // Re-ejecución: se repara el usuario existente sin borrar su historial.
  const { error: authError } = await supabase.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: JOHN_FULL_NAME },
  });

  if (authError) {
    throw new Error(`No se pudo actualizar el usuario John: ${authError.message}`);
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: existing.id,
      role: 'barbero',
      full_name: JOHN_FULL_NAME,
      phone: JOHN_PHONE,
      is_active: true,
    },
    { onConflict: 'id' },
  );

  if (profileError) {
    throw new Error(`No se pudo actualizar el perfil de John: ${profileError.message}`);
  }

  const { data: barber, error: barberError } = await supabase
    .from('barbers')
    .select('id')
    .eq('profile_id', existing.id)
    .maybeSingle();

  if (barberError) {
    throw new Error(`No se pudo consultar la ficha de John: ${barberError.message}`);
  }

  let barberId = barber?.id ?? null;

  if (!barberId) {
    const { data: inserted, error: insertError } = await supabase
      .from('barbers')
      .insert({
        profile_id: existing.id,
        display_name: 'John',
        bio: 'Barbero de prueba especializado en cortes clásicos y perfilado de barba.',
        accent_color: '#3f4a5a',
        commission_rate: 40,
        sort_order: 1,
        is_active: true,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      throw new Error(`No se pudo reparar la ficha de John: ${insertError?.message}`);
    }

    barberId = inserted.id;
  } else {
    const { error: updateError } = await supabase
      .from('barbers')
      .update({
        display_name: 'John',
        bio: 'Barbero de prueba especializado en cortes clásicos y perfilado de barba.',
        accent_color: '#3f4a5a',
        commission_rate: 40,
        sort_order: 1,
        is_active: true,
      })
      .eq('id', barberId);

    if (updateError) {
      throw new Error(`No se pudo actualizar la ficha de John: ${updateError.message}`);
    }
  }

  johnPassword = password;
  return { created: false, barberId, password };
}

async function getSlots(date) {
  const query = new URLSearchParams({
    barberId: johnBarberId,
    date,
    serviceIds: serviceIds.join(','),
  });
  const response = await api('GET', `/availability?${query.toString()}`);
  const data = expectStatus(response, 200, `Disponibilidad ${date}`);
  return data.slots ?? [];
}

async function writeReport() {
  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  const status = mainError || failed > 0 ? 'CON ERRORES' : 'OK';
  const lines = [
    '# Validación funcional en vivo',
    '',
    `- Fecha: ${new Date().toISOString()}`,
    `- API: ${baseUrl}`,
    `- Resultado: ${status}`,
    `- Comprobaciones: ${passed} correctas, ${failed} con error`,
    '',
    '## Comprobaciones',
    '',
    '| Estado | Comprobación | Detalle | ms |',
    '| --- | --- | --- | --- |',
    ...checks.map(
      (item) =>
        `| ${item.ok ? 'OK' : 'FALLO'} | ${escapeMarkdown(item.name)} | ${escapeMarkdown(item.detail)} | ${item.ms} |`,
    ),
    '',
  ];

  if (mainError) {
    lines.push(
      '## Error de ejecución',
      '',
      '```text',
      String(mainError.stack ?? mainError.message),
      '```',
      '',
    );
  }

  lines.push(
    '## Datos de prueba',
    '',
    `- Barbero: John (${JOHN_EMAIL}), barberId ${johnBarberId ?? 'no creado'}`,
    `- Cliente principal: ${CLIENT_ONE.fullName} ${CLIENT_ONE.phone}`,
    `- Cita: ${appointmentOne?.code ?? 'no creada'}, total ${appointmentOne?.total ?? '-'} CLP`,
    `- Reseña: ${reviewId ?? 'no creada'}`,
    `- Venta: ${usedSummary.saleCode ?? 'no creada'}, total ${usedSummary.saleTotal ?? '-'} CLP`,
    '',
    '## Limpieza',
    '',
    '- Administrador temporal eliminado.',
    '- Bloqueo temporal eliminado.',
    '- Stock restaurado.',
    '- John, clientes, cita, pago y reseña quedan como datos de demostración.',
    '- Archivo de credenciales de prueba: `server/.test-credentials.json` (no versionado).',
    '',
    '## Nota de seguridad',
    '',
    'No se incluyen claves ni contraseñas en este informe.',
    '',
  );

  await writeFile(reportPath, `${lines.join('\n')}`, 'utf8');

  return { passed, failed, status };
}

try {
  await check('API disponible', async () => {
    const response = await api('GET', '/health');
    const data = expectStatus(response, 200, 'Healthcheck');
    assert(data?.status === 'ok', 'El healthcheck no devolvió status ok');
    return `HTTP 200, ${data.status}`;
  });

  await check('Administrador temporal creado', async () => {
    tempAdmin = await createTempAdmin();
    return tempAdmin.email;
  });

  await check('Login de administrador', async () => {
    const data = await login(tempAdmin.email, tempAdmin.password);
    adminToken = data.accessToken;
    assert(data.user?.role === 'admin', `Rol inesperado: ${data.user?.role}`);
    return `${data.user.email} (${data.user.role})`;
  });

  await check('Configuración del negocio actualizada', async () => {
    const response = await api('PATCH', '/admin/settings', {
      token: adminToken,
      body: TEST_SETTINGS,
    });
    const data = expectStatus(response, 200, 'Actualizar configuración');
    assert(
      data.businessName === TEST_SETTINGS.businessName,
      `businessName inesperado: ${data.businessName}`,
    );

    const publicResponse = await api('GET', '/public/settings');
    const publicData = expectStatus(publicResponse, 200, 'Configuración pública');
    assert(
      publicData.businessName === TEST_SETTINGS.businessName,
      'La configuración pública no refleja el cambio',
    );

    return `${publicData.businessName} / ${publicData.timezone} / ${publicData.currency}`;
  });

  await check('Barbero John creado o actualizado', async () => {
    const data = await ensureJohn();
    johnBarberId = data.barberId;

    await writeFile(
      credentialsPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          john: {
            email: JOHN_EMAIL,
            password: data.password,
            barberId: data.barberId,
          },
          note: 'Credenciales de prueba. No versionar. Eliminar antes de producción.',
        },
        null,
        2,
      )}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );

    return `${data.created ? 'creado' : 'actualizado'}: ${JOHN_EMAIL} / ${data.barberId}`;
  });

  await check('Horario de John configurado', async () => {
    const schedules = [];

    for (let weekday = 1; weekday <= 6; weekday += 1) {
      schedules.push({ weekday, startTime: '10:00', endTime: '14:00' });
      schedules.push({ weekday, startTime: '15:00', endTime: '19:00' });
    }

    const response = await api('PUT', `/admin/barbers/${johnBarberId}/schedules`, {
      token: adminToken,
      body: { schedules },
    });
    const data = expectStatus(response, 200, 'Reemplazar horarios');
    assert(Array.isArray(data) && data.length === 12, `Turnos guardados: ${data?.length}`);
    const weekdays = new Set(data.filter((item) => item.isActive).map((item) => item.weekday));
    assert(weekdays.size === 6, 'No se configuraron los seis días de trabajo');

    return 'Lunes a sábado, 10:00-14:00 y 15:00-19:00';
  });

  await check('Servicios asignados a John', async () => {
    const response = await api('GET', '/admin/services', { token: adminToken });
    const services = expectStatus(response, 200, 'Listar servicios');
    const active = services.filter((service) => service.isActive);
    assert(active.length >= 2, 'No hay suficientes servicios activos');

    const assignment = await api('PUT', `/admin/barbers/${johnBarberId}/services`, {
      token: adminToken,
      body: { services: active.map((service) => ({ serviceId: service.id })) },
    });
    const assigned = expectStatus(assignment, 200, 'Asignar servicios');
    assert(assigned.length === active.length, `Servicios asignados: ${assigned.length}`);

    const names = ['Corte clásico', 'Perfilado de barba'];
    serviceIds = names.map((name) => active.find((service) => service.name === name)?.id);
    assert(serviceIds.every(Boolean), `Faltan servicios del seed: ${names.join(', ')}`);

    return `${assigned.length} servicios; la cita usará ${names.join(' + ')}`;
  });

  await check('John visible en el catálogo público', async () => {
    const response = await api('GET', '/public/barbers');
    const barbers = expectStatus(response, 200, 'Barberos públicos');
    const john = barbers.find((barber) => barber.id === johnBarberId);
    assert(john, 'John no aparece en /public/barbers');
    assert(
      Array.isArray(john.services) && john.services.length > 0,
      'John no tiene servicios públicos',
    );
    return `${john.displayName} con ${john.services.length} servicios`;
  });

  let bookingDay = null;
  let timeOffDay = null;

  await check('Disponibilidad pública con horarios', async () => {
    const days = [];
    let date = addDaysToDate(todayInTimeZone(), 7);

    for (let index = 0; index < 14 && days.length < 2; index += 1) {
      const slots = await getSlots(date);

      if (slots.length >= 4) {
        days.push({ date, slots });
      }

      date = addDaysToDate(date, 1);
    }

    assert(days.length >= 2, 'No se encontraron dos días con al menos cuatro horarios');
    bookingDay = days[0];
    timeOffDay = days[1];

    return `${bookingDay.date} (${bookingDay.slots.length} horarios), ${timeOffDay.date} (${timeOffDay.slots.length} horarios)`;
  });

  await check('Bloqueo temporal elimina disponibilidad', async () => {
    const slot = timeOffDay.slots[Math.floor(timeOffDay.slots.length / 2)];

    const createResponse = await api('POST', '/admin/time-off', {
      token: adminToken,
      body: {
        barberId: johnBarberId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        reason: 'Bloqueo de prueba automatizada',
      },
    });
    const created = expectStatus(createResponse, 201, 'Crear bloqueo');
    timeOffId = created.id;

    const blockedSlots = await getSlots(timeOffDay.date);
    assert(
      !blockedSlots.some((item) => sameInstant(item.startsAt, slot.startsAt)),
      'El bloqueo no eliminó el horario',
    );

    const deleteResponse = await api('DELETE', `/admin/time-off/${timeOffId}`, {
      token: adminToken,
    });
    expectStatus(deleteResponse, 200, 'Eliminar bloqueo');
    timeOffId = null;

    const restoredSlots = await getSlots(timeOffDay.date);
    assert(
      restoredSlots.some((item) => sameInstant(item.startsAt, slot.startsAt)),
      'El horario no volvió tras eliminar el bloqueo',
    );

    return `${slot.startsAt} bloqueado y liberado`;
  });

  let firstSlot = null;
  let rescheduleSlot = null;
  let thirdSlot = null;

  await check('Cita de invitado creada', async () => {
    firstSlot = bookingDay.slots[0];
    rescheduleSlot = bookingDay.slots.find(
      (slot) => new Date(slot.startsAt).getTime() >= new Date(firstSlot.endsAt).getTime(),
    );
    assert(rescheduleSlot, 'No hay un segundo horario no superpuesto');
    thirdSlot = bookingDay.slots.find(
      (slot) => new Date(slot.startsAt).getTime() >= new Date(rescheduleSlot.endsAt).getTime(),
    );
    assert(thirdSlot, 'No hay un tercer horario no superpuesto');

    const response = await api('POST', '/appointments', {
      body: {
        barberId: johnBarberId,
        serviceIds,
        startsAt: firstSlot.startsAt,
        fullName: CLIENT_ONE.fullName,
        phone: CLIENT_ONE.phone,
        email: CLIENT_ONE.email,
        notes: 'Cita de prueba automatizada',
        company: '',
      },
    });
    appointmentOne = expectStatus(response, 201, 'Crear cita');

    assert(appointmentOne.code, 'La cita no tiene código');
    assert(appointmentOne.status === 'pendiente', `Estado inesperado: ${appointmentOne.status}`);
    assert(
      Number(appointmentOne.total) === 20000,
      `Total esperado 20000, recibido ${appointmentOne.total}`,
    );

    return `${appointmentOne.code} / ${appointmentOne.startsAt} / ${appointmentOne.total} CLP`;
  });

  await check('Consulta por código y teléfono', async () => {
    const response = await api(
      'GET',
      `/appointments/${encodeURIComponent(appointmentOne.code)}?phone=${encodeURIComponent(CLIENT_ONE.phone)}`,
    );
    const data = expectStatus(response, 200, 'Consultar cita');
    assert(data.code === appointmentOne.code, 'El código consultado no coincide');
    assert(data.client?.fullName === CLIENT_ONE.fullName, 'Nombre del cliente distinto');
    assert(
      Array.isArray(data.services) && data.services.length === 2,
      'La cita no tiene dos servicios',
    );
    return `${data.code} / ${data.status} / ${data.services.length} servicios`;
  });

  await check('Doble reserva rechazada con 409', async () => {
    const response = await api('POST', '/appointments', {
      body: {
        barberId: johnBarberId,
        serviceIds,
        startsAt: firstSlot.startsAt,
        fullName: CLIENT_TWO.fullName,
        phone: CLIENT_TWO.phone,
        email: CLIENT_TWO.email,
      },
    });

    expectStatus(response, 409, 'Doble reserva');
    assert(
      response.json?.error?.code === 'SLOT_UNAVAILABLE',
      `Código de error inesperado: ${response.json?.error?.code}`,
    );

    return response.json.error.message;
  });

  await check('Reprogramación de cita', async () => {
    const response = await api(
      'POST',
      `/appointments/${encodeURIComponent(appointmentOne.code)}/reschedule`,
      {
        body: {
          phone: CLIENT_ONE.phone,
          startsAt: rescheduleSlot.startsAt,
        },
      },
    );
    const data = expectStatus(response, 200, 'Reprogramar cita');
    assert(
      sameInstant(data.startsAt, rescheduleSlot.startsAt),
      'La cita no quedó en el nuevo horario',
    );
    assert(data.status === 'pendiente', `Estado inesperado: ${data.status}`);
    return `${data.code} -> ${data.startsAt}`;
  });

  await check('Cita cancelada libera el horario', async () => {
    const createResponse = await api('POST', '/appointments', {
      body: {
        barberId: johnBarberId,
        serviceIds,
        startsAt: thirdSlot.startsAt,
        fullName: CLIENT_TWO.fullName,
        phone: CLIENT_TWO.phone,
        email: CLIENT_TWO.email,
        notes: 'Cita para prueba de cancelación',
      },
    });
    const second = expectStatus(createResponse, 201, 'Crear segunda cita');

    const cancelResponse = await api(
      'POST',
      `/appointments/${encodeURIComponent(second.code)}/cancel`,
      {
        body: {
          phone: CLIENT_TWO.phone,
          reason: 'Cancelación de prueba automatizada',
        },
      },
    );
    const cancelled = expectStatus(cancelResponse, 200, 'Cancelar cita');
    assert(cancelled.status === 'cancelada', `Estado inesperado: ${cancelled.status}`);

    const slots = await getSlots(bookingDay.date);
    assert(
      slots.some((slot) => sameInstant(slot.startsAt, thirdSlot.startsAt)),
      'El horario no se liberó tras cancelar',
    );

    return `${second.code} cancelada y horario liberado`;
  });

  await check('Cita completada con pago y propina', async () => {
    const response = await api(
      'POST',
      `/admin/appointments/${appointmentOne.id}/complete`,
      {
        token: adminToken,
        body: {
          method: 'efectivo',
          amount: Number(appointmentOne.total),
          tip: 1000,
        },
      },
    );
    const data = expectStatus(response, 200, 'Completar cita');
    assert(data.status === 'completada', `Estado inesperado: ${data.status}`);

    const paymentsResponse = await api('GET', '/admin/payments?limit=200', {
      token: adminToken,
    });
    const payments = expectStatus(paymentsResponse, 200, 'Listar pagos');
    const payment = payments.find((item) => item.appointmentId === appointmentOne.id);

    assert(payment, 'No se encontró el pago de la cita');
    assert(
      Number(payment.amount) === Number(appointmentOne.total),
      `Monto distinto: ${payment.amount}`,
    );
    assert(Number(payment.tipAmount) === 1000, `Propina distinta: ${payment.tipAmount}`);
    assert(payment.status === 'pagado', `Estado de pago: ${payment.status}`);

    return `Pago ${payment.amount} + propina ${payment.tipAmount}`;
  });

  await check('Reseña creada y moderada', async () => {
    const createResponse = await api('POST', '/reviews', {
      body: {
        code: appointmentOne.code,
        phone: CLIENT_ONE.phone,
        rating: 5,
        comment: 'Excelente atención y prolijidad. Recomendado.',
      },
    });
    const review = expectStatus(createResponse, 201, 'Crear reseña');
    assert(review.rating === 5, `Rating inesperado: ${review.rating}`);
    assert(review.isPublished === false, 'La reseña debería nacer oculta');
    reviewId = review.id;

    const before = expectStatus(
      await api('GET', '/public/reviews?limit=50'),
      200,
      'Reseñas públicas antes',
    );
    assert(!before.some((item) => item.id === reviewId), 'La reseña oculta apareció en público');

    const hide = expectStatus(
      await api('PATCH', `/admin/reviews/${reviewId}`, {
        token: adminToken,
        body: { isPublished: false },
      }),
      200,
      'Ocultar reseña',
    );
    assert(hide.isPublished === false, 'No se ocultó la reseña');

    const publish = expectStatus(
      await api('PATCH', `/admin/reviews/${reviewId}`, {
        token: adminToken,
        body: { isPublished: true },
      }),
      200,
      'Publicar reseña',
    );
    assert(publish.isPublished === true, 'No se publicó la reseña');

    const after = expectStatus(
      await api('GET', '/public/reviews?limit=50'),
      200,
      'Reseñas públicas después',
    );
    assert(
      after.some((item) => item.id === reviewId),
      'La reseña publicada no aparece en público',
    );

    return `reviewId ${reviewId} oculta y publicada`;
  });

  await check('Venta de producto y stock restaurado', async () => {
    const productResponse = await api('GET', '/admin/products?search=Pomada', {
      token: adminToken,
    });
    const products = expectStatus(productResponse, 200, 'Buscar producto');
    const product =
      products.find((item) => item.sku === 'POM-001') ??
      products.find((item) => item.name === 'Pomada clásica');
    assert(product, 'No se encontró Pomada clásica');

    const initialStock = Number(product.stock);

    const saleResponse = await api('POST', '/admin/sales', {
      token: adminToken,
      body: {
        items: [{ type: 'producto', id: product.id, quantity: 2 }],
        method: 'efectivo',
        notes: 'Venta de prueba automatizada',
      },
    });
    const sale = expectStatus(saleResponse, 201, 'Registrar venta');
    assert(Number(sale.total) === 24000, `Total de venta inesperado: ${sale.total}`);
    stockRestore = { productId: product.id, quantity: 2 };

    const afterSale = expectStatus(
      await api('GET', '/admin/products?search=Pomada', { token: adminToken }),
      200,
      'Producto tras venta',
    );
    const afterProduct = afterSale.find((item) => item.id === product.id);
    assert(
      Number(afterProduct.stock) === initialStock - 2,
      `Stock tras venta: ${afterProduct.stock}, esperado ${initialStock - 2}`,
    );

    const restoreResponse = await api('POST', `/admin/products/${product.id}/stock`, {
      token: adminToken,
      body: {
        type: 'entrada',
        quantity: 2,
        reason: 'Restauración prueba automatizada',
      },
    });
    const restored = expectStatus(restoreResponse, 200, 'Reponer stock');
    assert(
      Number(restored.stock) === initialStock,
      `Stock restaurado: ${restored.stock}, esperado ${initialStock}`,
    );
    stockRestore = null;

    const movements = expectStatus(
      await api('GET', `/admin/products/${product.id}/movements`, { token: adminToken }),
      200,
      'Movimientos de stock',
    );
    const saleMovement = movements.find(
      (item) => item.type === 'venta' && item.referenceId === sale.id,
    );
    const entryMovement = movements.find(
      (item) => item.type === 'entrada' && item.reason === 'Restauración prueba automatizada',
    );

    assert(saleMovement, 'No se registró el movimiento de venta');
    assert(entryMovement, 'No se registró el movimiento de entrada');

    usedSummary = { saleCode: sale.code, saleTotal: sale.total };

    return `venta ${sale.code} ${sale.total} CLP; stock ${initialStock} -> ${initialStock - 2} -> ${initialStock}`;
  });

  await check('Dashboard con métricas del período', async () => {
    const today = todayInTimeZone();
    const from = encodeURIComponent(zonedDateStart(today));
    const to = encodeURIComponent(zonedDateStart(addDaysToDate(today, 15)));

    const response = await api('GET', `/admin/dashboard?from=${from}&to=${to}`, {
      token: adminToken,
    });
    const data = expectStatus(response, 200, 'Dashboard');
    const metrics = data.metrics;

    assert(Number(metrics.completed) >= 1, `Citas completadas: ${metrics.completed}`);
    assert(Number(metrics.revenue) >= 44000, `Ingresos: ${metrics.revenue}`);
    assert(Number(metrics.tips) >= 1000, `Propinas: ${metrics.tips}`);
    assert(Number(metrics.productRevenue) >= 24000, `Ingresos por productos: ${metrics.productRevenue}`);
    assert(Number(metrics.serviceRevenue) >= 20000, `Ingresos por servicios: ${metrics.serviceRevenue}`);
    assert(Array.isArray(data.dailyRevenue), 'dailyRevenue no es un arreglo');

    return `revenue ${metrics.revenue}, completed ${metrics.completed}, tips ${metrics.tips}`;
  });

  await check('Acceso de John como barbero', async () => {
    const session = await login(JOHN_EMAIL, johnPassword);
    assert(session.user?.role === 'barbero', `Rol inesperado: ${session.user?.role}`);
    assert(session.user?.barberId === johnBarberId, 'barberId distinto al esperado');

    const today = todayInTimeZone();
    const from = encodeURIComponent(zonedDateStart(today));
    const to = encodeURIComponent(zonedDateStart(addDaysToDate(today, 15)));

    const agenda = expectStatus(
      await api('GET', `/barber/agenda?from=${from}&to=${to}`, {
        token: session.accessToken,
      }),
      200,
      'Agenda de John',
    );
    assert(Array.isArray(agenda), 'La agenda no es un arreglo');
    assert(
      agenda.some((item) => item.id === appointmentOne.id),
      'La cita completada no aparece en la agenda de John',
    );

    const clients = expectStatus(
      await api('GET', '/barber/clients', { token: session.accessToken }),
      200,
      'Clientes de John',
    );
    assert(Array.isArray(clients), 'Los clientes no son un arreglo');

    expectStatus(
      await api('GET', '/admin/settings', { token: session.accessToken }),
      403,
      'John en /admin/settings',
    );
    expectStatus(
      await api('GET', '/admin/barbers', { token: session.accessToken }),
      403,
      'John en /admin/barbers',
    );

    return `agenda ${agenda.length}, clientes ${clients.length}, admin 403`;
  });

  await check('anon sin acceso directo a tablas', async () => {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/settings?select=business_name`, {
      headers: {
        apikey: env.supabaseAnonKey,
        authorization: `Bearer ${env.supabaseAnonKey}`,
      },
    });

    assert(
      response.status === 401 || response.status === 403,
      `REST anon devolvió HTTP ${response.status}`,
    );

    const adminWithoutToken = await api('GET', '/admin/settings');
    expectStatus(adminWithoutToken, 401, 'Admin sin token');

    return `REST anon HTTP ${response.status}; admin sin token HTTP 401`;
  });

  await check('Auditoría registrada', async () => {
    const audit = expectStatus(
      await api('GET', '/admin/audit?limit=100', { token: adminToken }),
      200,
      'Auditoría',
    );
    assert(Array.isArray(audit) && audit.length > 0, 'No hay registros de auditoría');
    return `${audit.length} registros`;
  });
} catch (error) {
  mainError = error;
  console.error(`\nEjecución interrumpida: ${error.message}`);
} finally {
  if (timeOffId && adminToken) {
    try {
      await api('DELETE', `/admin/time-off/${timeOffId}`, { token: adminToken });
    } catch (error) {
      console.warn(`No se pudo eliminar el bloqueo temporal: ${error.message}`);
    }
  }

  if (stockRestore && adminToken) {
    try {
      await api('POST', `/admin/products/${stockRestore.productId}/stock`, {
        token: adminToken,
        body: {
          type: 'entrada',
          quantity: stockRestore.quantity,
          reason: 'Restauración automática de respaldo',
        },
      });
    } catch (error) {
      console.warn(`No se pudo restaurar el stock: ${error.message}`);
    }
  }

  if (tempAdmin?.userId) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(tempAdmin.userId);

      if (error) {
        throw error;
      }

      console.log('Administrador temporal eliminado.');
    } catch (error) {
      console.warn(`No se pudo eliminar el administrador temporal: ${error.message}`);
    }
  }

  try {
    const summary = await writeReport();
    console.log(
      `\nResultado: ${summary.passed} correctas, ${summary.failed} con error. Informe: ${reportPath}`,
    );
  } catch (error) {
    console.error(`No se pudo escribir el informe: ${error.message}`);
    process.exitCode = 1;
  }

  if (mainError || checks.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}
