const LOCALE = 'es-CL';
const DEFAULT_TZ = 'America/Santiago';

export const APPOINTMENT_STATUS = {
  pendiente: 'Pendiente',
  confirmada: 'Confirmada',
  en_curso: 'En curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
  no_asistio: 'No asistió',
};

export const PAYMENT_STATUS = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  reembolsado: 'Reembolsado',
  fallido: 'Fallido',
};

export const METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  otro: 'Otro',
};

export const SOURCE_LABELS = {
  web: 'Web',
  mostrador: 'Mostrador',
  telefono: 'Teléfono',
  whatsapp: 'WhatsApp',
};

export const WEEKDAYS = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPrice(value, currency = 'CLP') {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return '—';
  }

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat(LOCALE).format(amount) : '—';
}

export function formatDuration(minutes) {
  const value = Number(minutes);

  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }

  if (value < 60) {
    return `${value} min`;
  }

  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function todayInZone(timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateString, days) {
  const parsed = new Date(`${dateString}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function dateInZone(value, timeZone = DEFAULT_TZ) {
  if (!value) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function timeInZone(value, timeZone = DEFAULT_TZ) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function formatDate(value, { withWeekday = false, timeZone = DEFAULT_TZ } = {}) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(LOCALE, {
    ...(withWeekday ? { weekday: 'long' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(value));
}

export function formatDateTime(value, timeZone = DEFAULT_TZ) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

export function formatTime(value, timeZone = DEFAULT_TZ) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(value));
}

export function formatDateInput(value, timeZone = DEFAULT_TZ) {
  return dateInZone(value, timeZone) || '';
}

export function formatTimeInput(value, timeZone = DEFAULT_TZ) {
  return timeInZone(value, timeZone) || '';
}

export function zonedDateStart(dateString, timeZone = DEFAULT_TZ) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const dayStart = Date.UTC(year, month - 1, day, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = new Date(dayStart + offsetMinutes * 60_000);
    const parts = formatter.formatToParts(candidate).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    if (`${parts.year}-${parts.month}-${parts.day}` === dateString) {
      return candidate.toISOString();
    }
  }

  return new Date(dayStart).toISOString();
}

export function zonedDateTimeToIso(dateString, timeString, timeZone = DEFAULT_TZ) {
  const [year, month, day] = String(dateString).split('-').map(Number);
  const [hour, minute] = String(timeString || '00:00').split(':').map(Number);
  const base = Date.UTC(year, month - 1, day, hour, minute, 0);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  for (let deltaMinutes = -14 * 60; deltaMinutes <= 14 * 60; deltaMinutes += 15) {
    const candidate = new Date(base + deltaMinutes * 60_000);
    const parts = formatter.formatToParts(candidate).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});

    const candidateDate = `${parts.year}-${parts.month}-${parts.day}`;
    const candidateTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;

    if (candidateDate === dateString && candidateTime === timeString) {
      return candidate.toISOString();
    }
  }

  return new Date(base).toISOString();
}

export function formatPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('56')) {
    const rest = digits.slice(2);

    if (rest.length === 9) {
      return `+56 ${rest.slice(0, 1)} ${rest.slice(1, 5)} ${rest.slice(5)}`;
    }
  }

  return `+${digits}`;
}

export function normalizePhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  if (digits.startsWith('56')) {
    return `+${digits}`;
  }

  return `+56${digits}`;
}

export function initials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function statusLabel(status) {
  return APPOINTMENT_STATUS[status] ?? status ?? '—';
}

export function paymentStatusLabel(status) {
  return PAYMENT_STATUS[status] ?? status ?? '—';
}

export function methodLabel(method) {
  return METHOD_LABELS[method] ?? method ?? '—';
}

export function sourceLabel(source) {
  return SOURCE_LABELS[source] ?? source ?? '—';
}

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
