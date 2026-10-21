import { supabaseAdmin } from '../config/supabase.js';
import { ApiError } from '../lib/errors.js';
import { getSettingsRow } from './catalog.service.js';
import { getAvailability } from './appointment.service.js';

const WEEKDAY_LABELS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

function throwIf(error) {
  if (error) {
    throw error;
  }
}

function toClock(value) {
  return String(value).slice(0, 5);
}

function clockToMinutes(value) {
  const [hours, minutes] = toClock(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToClock(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function dateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function timeInZone(value, timeZone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function mergeShifts(shifts) {
  const sorted = [...shifts]
    .map((shift) => ({ start: toClock(shift.start_time), end: toClock(shift.end_time) }))
    .sort((a, b) => a.start.localeCompare(b.start));

  return sorted.reduce((merged, shift) => {
    const last = merged[merged.length - 1];

    if (last && shift.start <= last.end) {
      last.end = shift.end > last.end ? shift.end : last.end;
      return merged;
    }

    merged.push({ ...shift });
    return merged;
  }, []);
}

export async function getPublicHours() {
  const settings = await getSettingsRow();

  const { data, error } = await supabaseAdmin
    .from('barber_schedules')
    .select('weekday, start_time, end_time, barbers!inner(is_active)')
    .eq('is_active', true)
    .eq('barbers.is_active', true)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true });

  throwIf(error);

  const byWeekday = new Map();

  for (const shift of data ?? []) {
    const current = byWeekday.get(shift.weekday) ?? [];
    current.push(shift);
    byWeekday.set(shift.weekday, current);
  }

  const days = WEEKDAY_LABELS.map((label, weekday) => {
    const shifts = mergeShifts(byWeekday.get(weekday) ?? []);

    return {
      weekday,
      label,
      isOpen: shifts.length > 0,
      shifts,
    };
  });

  return {
    timeZone: settings.timezone,
    maxAdvanceDays: settings.max_advance_days,
    minAdvanceMin: settings.min_advance_min,
    slotIntervalMin: settings.slot_interval_min,
    days,
  };
}

async function getService(serviceId) {
  const { data, error } = await supabaseAdmin
    .from('services')
    .select('id, name, duration_min, buffer_min, price, is_active')
    .eq('id', serviceId)
    .maybeSingle();

  throwIf(error);

  if (!data || !data.is_active) {
    throw ApiError.notFound('El servicio no está disponible', 'SERVICE_NOT_FOUND');
  }

  return data;
}

async function getEligibleBarbers(serviceId) {
  const { data, error } = await supabaseAdmin
    .from('barber_services')
    .select(
      'barber_id, price_override, duration_override, barbers!inner(id, display_name, is_active)',
    )
    .eq('service_id', serviceId)
    .eq('barbers.is_active', true);

  throwIf(error);

  return (data ?? [])
    .filter((row) => row.barbers)
    .map((row) => ({
      id: row.barbers.id,
      displayName: row.barbers.display_name,
      priceOverride: row.price_override,
      durationOverride: row.duration_override,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
}

function resolveBarber(barbers, barberId) {
  if (barbers.length === 0) {
    throw ApiError.badRequest(
      'El servicio no está disponible para ningún barbero',
      'SERVICE_NOT_AVAILABLE',
    );
  }

  if (!barberId || barberId === 'any') {
    if (barbers.length > 1) {
      throw ApiError.badRequest(
        'Debes elegir un barbero para consultar la disponibilidad',
        'BARBER_REQUIRED',
      );
    }

    return barbers[0];
  }

  const selected = barbers.find((barber) => barber.id === barberId);

  if (!selected) {
    throw ApiError.badRequest(
      'El barbero indicado no realiza este servicio',
      'BARBER_NOT_AVAILABLE',
    );
  }

  return selected;
}

export async function getDayAvailability({ date, serviceId, barberId = null }) {
  const settings = await getSettingsRow();
  const today = dateInZone(new Date(), settings.timezone);
  const limit = addDays(today, settings.max_advance_days);

  if (date < today || date > limit) {
    throw ApiError.badRequest(
      `La fecha debe estar entre ${today} y ${limit}`,
      'DATE_OUT_OF_RANGE',
      { min: today, max: limit },
    );
  }

  const service = await getService(serviceId);
  const barbers = await getEligibleBarbers(serviceId);
  const barber = resolveBarber(barbers, barberId);

  const effectiveDuration = barber.durationOverride ?? service.duration_min;
  const effectivePrice = barber.priceOverride ?? service.price;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

  const { data: schedules, error: scheduleError } = await supabaseAdmin
    .from('barber_schedules')
    .select('start_time, end_time')
    .eq('barber_id', barber.id)
    .eq('weekday', weekday)
    .eq('is_active', true)
    .order('start_time', { ascending: true });

  throwIf(scheduleError);

  const base = {
    date,
    timeZone: settings.timezone,
    barber: { id: barber.id, displayName: barber.displayName },
    service: {
      id: service.id,
      name: service.name,
      durationMin: effectiveDuration,
      bufferMin: service.buffer_min,
      price: effectivePrice,
    },
  };

  if (!schedules || schedules.length === 0) {
    return { ...base, isOpen: false, slots: [] };
  }

  const available = await getAvailability({
    barberId: barber.id,
    date,
    serviceIds: [serviceId],
  });

  const availableByTime = new Map(
    available.map((slot) => [timeInZone(slot.starts_at, settings.timezone), slot]),
  );

  const step = settings.slot_interval_min;
  const slots = [];

  for (const schedule of schedules) {
    const start = clockToMinutes(schedule.start_time);
    const end = clockToMinutes(schedule.end_time);

    for (let cursor = start; cursor < end; cursor += step) {
      const time = minutesToClock(cursor);
      const match = availableByTime.get(time) ?? null;

      slots.push({
        time,
        startsAt: match ? match.starts_at : null,
        endsAt: match ? match.ends_at : null,
        available: Boolean(match),
      });
    }
  }

  return { ...base, isOpen: true, slots };
}
