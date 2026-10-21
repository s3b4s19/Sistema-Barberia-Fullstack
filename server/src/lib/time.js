import { env } from '../config/env.js';

export function todayInTimeZone(timeZone = env.timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysToDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function zonedDateStart(dateString, timeZone = env.timezone) {
  const [year, month, day] = dateString.split('-').map(Number);
  const dayStart = Date.UTC(year, month - 1, day, 0, 0, 0);

  // Busca el primer instante cuya fecha local coincide con dateString.
  // El rango cubre cambios de horario de verano y desfases de hasta 14 horas.
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

    const localDate = `${parts.year}-${parts.month}-${parts.day}`;

    if (localDate === dateString) {
      return candidate.toISOString();
    }
  }

  return new Date(dayStart).toISOString();
}

export function defaultAgendaRange() {
  const today = todayInTimeZone();
  return {
    from: zonedDateStart(today),
    to: zonedDateStart(addDaysToDate(today, 7)),
  };
}

export function defaultMetricsRange() {
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}
