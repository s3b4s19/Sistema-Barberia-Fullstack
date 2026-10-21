const LOCALE = 'es-CL';

export function formatPrice(value, currency = 'CLP') {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'Por confirmar';
  }

  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
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

export function todayInZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseDate(date) {
  const [year, month, day] = String(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function toDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date, days) {
  const parsed = parseDate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function weekdayOf(date) {
  return parseDate(date).getUTCDay();
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function formatLongDate(date, timeZone = 'America/Santiago') {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(new Date(`${date}T12:00:00Z`));
}

export function formatMonth(year, month) {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month, 1, 12)));
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

    if (rest.length === 8) {
      return `+56 ${rest.slice(0, 1)} ${rest.slice(1, 5)} ${rest.slice(5)}`;
    }
  }

  return `+${digits}`;
}

export function phoneDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.startsWith('56') && digits.length > 9 ? digits.slice(2) : digits;
}

export function whatsappHref(value) {
  return `https://wa.me/${String(value ?? '').replace(/\D/g, '')}`;
}

export function normalizeWhatsAppHandle(value) {
  return String(value ?? '').trim().replace(/^@/, '');
}

export function capitalize(value) {
  const text = String(value ?? '');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}
