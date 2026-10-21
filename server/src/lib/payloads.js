import { ApiError } from './errors.js';
import {
  optionalBoolean,
  optionalEmail,
  optionalString,
  optionalUuid,
  parseUuidList,
  requireDate,
  requireDateTime,
  requireEmail,
  requireEnum,
  requireInteger,
  requireNumber,
  requireString,
  requireUuid,
} from './validation.js';
import { normalizePhone } from './phone.js';
import { normalizeUsername } from './username.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export const APPOINTMENT_STATUSES = [
  'pendiente',
  'confirmada',
  'en_curso',
  'completada',
  'cancelada',
  'no_asistio',
];

export const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];
export const APPOINTMENT_SOURCES = ['web', 'mostrador', 'telefono', 'whatsapp'];

export function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseSlug(value, field, fallbackName = null) {
  if ((value === undefined || value === null || value === '') && fallbackName) {
    return slugify(fallbackName);
  }

  const slug = requireString(value, field, { min: 2, max: 80 }).toLowerCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw ApiError.badRequest(
      `El campo ${field} solo admite minúsculas, números y guiones`,
      'INVALID_INPUT',
      { field },
    );
  }

  return slug;
}

export function servicePayload(body, { partial = false } = {}) {
  const output = {};

  if (!partial || body.name !== undefined) {
    output.name = requireString(body.name, 'name', { min: 2, max: 120 });
  }

  if (!partial || body.slug !== undefined) {
    output.slug = parseSlug(body.slug, 'slug', output.name ?? null);
  }

  if (!partial || body.categoryId !== undefined) {
    output.categoryId = requireUuid(body.categoryId, 'categoryId');
  }

  if (!partial || body.description !== undefined) {
    output.description = optionalString(body.description, 'description', { max: 1000 });
  }

  if (!partial || body.durationMin !== undefined) {
    output.durationMin = requireInteger(body.durationMin, 'durationMin', { min: 5, max: 480 });
  }

  if (!partial || body.bufferMin !== undefined) {
    output.bufferMin =
      body.bufferMin === undefined
        ? 5
        : requireInteger(body.bufferMin, 'bufferMin', { min: 0, max: 120 });
  }

  if (!partial || body.price !== undefined) {
    output.price = requireNumber(body.price, 'price', { min: 0, max: 100_000_000 });
  }

  if (!partial || body.imageUrl !== undefined) {
    output.imageUrl = optionalString(body.imageUrl, 'imageUrl', { max: 500 });
  }

  if (!partial || body.isActive !== undefined) {
    output.isActive = optionalBoolean(body.isActive) ?? true;
  }

  if (!partial || body.sortOrder !== undefined) {
    output.sortOrder =
      body.sortOrder === undefined
        ? 0
        : requireInteger(body.sortOrder, 'sortOrder', { min: 0, max: 10_000 });
  }

  return output;
}

export function categoryPayload(body, { partial = false } = {}) {
  const output = {};

  if (!partial || body.name !== undefined) {
    output.name = requireString(body.name, 'name', { min: 2, max: 80 });
  }

  if (!partial || body.slug !== undefined) {
    output.slug = parseSlug(body.slug, 'slug', output.name ?? null);
  }

  if (!partial || body.description !== undefined) {
    output.description = optionalString(body.description, 'description', { max: 500 });
  }

  if (!partial || body.sortOrder !== undefined) {
    output.sortOrder =
      body.sortOrder === undefined
        ? 0
        : requireInteger(body.sortOrder, 'sortOrder', { min: 0, max: 10_000 });
  }

  if (!partial || body.isActive !== undefined) {
    output.isActive = optionalBoolean(body.isActive) ?? true;
  }

  return output;
}

export function barberCreatePayload(body) {
  const displayName = requireString(body.displayName, 'displayName', { min: 2, max: 80 });

  return {
    email: requireEmail(body.email, 'email'),
    password: requireString(body.password, 'password', { min: 8, max: 128 }),
    username: normalizeUsername(body.username),
    fullName: requireString(body.fullName, 'fullName', { min: 2, max: 120 }),
    displayName,
    phone: body.phone ? normalizePhone(body.phone) : null,
    bio: optionalString(body.bio, 'bio', { max: 1000 }),
    photoUrl: optionalString(body.photoUrl, 'photoUrl', { max: 500 }),
    accentColor: parseColor(body.accentColor),
    commissionRate:
      body.commissionRate === undefined
        ? 0
        : requireNumber(body.commissionRate, 'commissionRate', { min: 0, max: 100 }),
    sortOrder:
      body.sortOrder === undefined
        ? 0
        : requireInteger(body.sortOrder, 'sortOrder', { min: 0, max: 10_000 }),
    isActive: optionalBoolean(body.isActive) ?? true,
  };
}

export function barberUpdatePayload(body) {
  const output = {};

  if (body.displayName !== undefined) {
    output.displayName = requireString(body.displayName, 'displayName', { min: 2, max: 80 });
  }

  if (body.bio !== undefined) {
    output.bio = optionalString(body.bio, 'bio', { max: 1000 });
  }

  if (body.photoUrl !== undefined) {
    output.photoUrl = optionalString(body.photoUrl, 'photoUrl', { max: 500 });
  }

  if (body.accentColor !== undefined) {
    output.accentColor = parseColor(body.accentColor);
  }

  if (body.commissionRate !== undefined) {
    output.commissionRate = requireNumber(body.commissionRate, 'commissionRate', {
      min: 0,
      max: 100,
    });
  }

  if (body.sortOrder !== undefined) {
    output.sortOrder = requireInteger(body.sortOrder, 'sortOrder', { min: 0, max: 10_000 });
  }

  if (body.username !== undefined) {
    output.username = normalizeUsername(body.username);
  }

  if (body.isActive !== undefined) {
    output.isActive = optionalBoolean(body.isActive);
  }

  return output;
}

function parseColor(value) {
  if (value === undefined || value === null || value === '') {
    return '#3f4a5a';
  }

  const color = requireString(value, 'accentColor', { min: 7, max: 7 });

  if (!COLOR_PATTERN.test(color)) {
    throw ApiError.badRequest('El color debe tener formato hexadecimal #RRGGBB', 'INVALID_INPUT', {
      field: 'accentColor',
    });
  }

  return color.toLowerCase();
}

function parseTime(value, field) {
  const time = requireString(value, field, { min: 5, max: 8 });

  if (!TIME_PATTERN.test(time)) {
    throw ApiError.badRequest(
      `El campo ${field} debe usar el formato HH:MM`,
      'INVALID_INPUT',
      { field },
    );
  }

  return time.length === 5 ? `${time}:00` : time;
}

export function schedulesPayload(body) {
  if (!Array.isArray(body.schedules)) {
    throw ApiError.badRequest('El campo schedules debe ser un arreglo', 'INVALID_INPUT');
  }

  if (body.schedules.length > 21) {
    throw ApiError.badRequest('No puedes definir más de 21 turnos', 'INVALID_INPUT');
  }

  const schedules = body.schedules.map((item, index) => {
    const weekday = requireInteger(item.weekday, `schedules[${index}].weekday`, {
      min: 0,
      max: 6,
    });
    const startTime = parseTime(item.startTime, `schedules[${index}].startTime`);
    const endTime = parseTime(item.endTime, `schedules[${index}].endTime`);

    if (startTime >= endTime) {
      throw ApiError.badRequest(
        `El turno ${index + 1} debe terminar después de comenzar`,
        'INVALID_INPUT',
      );
    }

    return {
      weekday,
      startTime,
      endTime,
      isActive: optionalBoolean(item.isActive) ?? true,
    };
  });

  for (let day = 0; day <= 6; day += 1) {
    const daySchedules = schedules
      .filter((schedule) => schedule.weekday === day && schedule.isActive)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    for (let index = 1; index < daySchedules.length; index += 1) {
      if (daySchedules[index].startTime < daySchedules[index - 1].endTime) {
        throw ApiError.badRequest(
          'Los turnos de un mismo día no pueden superponerse',
          'INVALID_INPUT',
        );
      }
    }
  }

  return schedules;
}

export function timeOffPayload(body) {
  const startsAt = requireDateTime(body.startsAt, 'startsAt');
  const endsAt = requireDateTime(body.endsAt, 'endsAt');

  if (new Date(endsAt) <= new Date(startsAt)) {
    throw ApiError.badRequest('El bloqueo debe terminar después de comenzar', 'INVALID_INPUT');
  }

  return {
    barberId: optionalUuid(body.barberId, 'barberId'),
    startsAt,
    endsAt,
    reason: optionalString(body.reason, 'reason', { max: 500 }),
  };
}

export function barberServicesPayload(body) {
  if (!Array.isArray(body.services)) {
    throw ApiError.badRequest('El campo services debe ser un arreglo', 'INVALID_INPUT');
  }

  if (body.services.length > 100) {
    throw ApiError.badRequest('No puedes asignar más de 100 servicios', 'INVALID_INPUT');
  }

  const seen = new Set();

  return body.services.map((item, index) => {
    const serviceId = requireUuid(item.serviceId, `services[${index}].serviceId`);

    if (seen.has(serviceId)) {
      throw ApiError.badRequest('No puedes repetir un servicio', 'INVALID_INPUT');
    }

    seen.add(serviceId);

    return {
      serviceId,
      priceOverride:
        item.priceOverride === undefined || item.priceOverride === null || item.priceOverride === ''
          ? null
          : requireNumber(item.priceOverride, `services[${index}].priceOverride`, {
              min: 0,
              max: 100_000_000,
            }),
      durationOverride:
        item.durationOverride === undefined ||
        item.durationOverride === null ||
        item.durationOverride === ''
          ? null
          : requireInteger(item.durationOverride, `services[${index}].durationOverride`, {
              min: 5,
              max: 480,
            }),
    };
  });
}

export function reviewPayload(body) {
  return {
    code: requireString(body.code, 'code', { min: 4, max: 30 }).toUpperCase(),
    phone: normalizePhone(body.phone),
    rating: requireInteger(body.rating, 'rating', { min: 1, max: 5 }),
    comment: optionalString(body.comment, 'comment', { max: 1000 }),
  };
}

export function settingsPayload(body) {
  const output = {};

  if (body.businessName !== undefined) {
    output.businessName = requireString(body.businessName, 'businessName', { min: 2, max: 120 });
  }

  if (body.legalName !== undefined) {
    output.legalName = optionalString(body.legalName, 'legalName', { max: 120 });
  }

  if (body.taxId !== undefined) {
    output.taxId = optionalString(body.taxId, 'taxId', { max: 30 });
  }

  if (body.phone !== undefined) {
    output.phone = body.phone ? normalizePhone(body.phone) : null;
  }

  if (body.email !== undefined) {
    output.email = optionalEmail(body.email);
  }

  if (body.address !== undefined) {
    output.address = optionalString(body.address, 'address', { max: 200 });
  }

  if (body.city !== undefined) {
    output.city = optionalString(body.city, 'city', { max: 80 });
  }

  if (body.timezone !== undefined) {
    const timezone = requireString(body.timezone, 'timezone', { min: 3, max: 64 });

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw ApiError.badRequest('La zona horaria no es válida', 'INVALID_INPUT', {
        field: 'timezone',
      });
    }

    output.timezone = timezone;
  }

  if (body.currency !== undefined) {
    const currency = requireString(body.currency, 'currency', { min: 3, max: 3 }).toUpperCase();

    if (!/^[A-Z]{3}$/.test(currency)) {
      throw ApiError.badRequest('La moneda debe usar código ISO de 3 letras', 'INVALID_INPUT', {
        field: 'currency',
      });
    }

    output.currency = currency;
  }

  if (body.locale !== undefined) {
    output.locale = requireString(body.locale, 'locale', { min: 2, max: 20 });
  }

  if (body.phonePrefix !== undefined) {
    const prefix = requireString(body.phonePrefix, 'phonePrefix', { min: 2, max: 5 });

    if (!/^\+\d{1,4}$/.test(prefix)) {
      throw ApiError.badRequest('El prefijo debe tener formato +56', 'INVALID_INPUT', {
        field: 'phonePrefix',
      });
    }

    output.phonePrefix = prefix;
  }

  if (body.slotIntervalMin !== undefined) {
    output.slotIntervalMin = requireEnum(body.slotIntervalMin, 'slotIntervalMin', [
      5, 10, 15, 20, 30, 45, 60,
    ]);
  }

  if (body.minAdvanceMin !== undefined) {
    output.minAdvanceMin = requireInteger(body.minAdvanceMin, 'minAdvanceMin', {
      min: 0,
      max: 10_080,
    });
  }

  if (body.maxAdvanceDays !== undefined) {
    output.maxAdvanceDays = requireInteger(body.maxAdvanceDays, 'maxAdvanceDays', {
      min: 1,
      max: 365,
    });
  }

  if (body.cancellationHours !== undefined) {
    output.cancellationHours = requireInteger(body.cancellationHours, 'cancellationHours', {
      min: 0,
      max: 720,
    });
  }

  if (body.depositPercent !== undefined) {
    output.depositPercent = requireNumber(body.depositPercent, 'depositPercent', {
      min: 0,
      max: 100,
    });
  }

  if (body.taxRate !== undefined) {
    output.taxRate = requireNumber(body.taxRate, 'taxRate', { min: 0, max: 100 });
  }

  if (body.pricesIncludeTax !== undefined) {
    output.pricesIncludeTax = optionalBoolean(body.pricesIncludeTax);
  }

  if (body.instagram !== undefined) {
    output.instagram = optionalString(body.instagram, 'instagram', { max: 100 });
  }

  if (body.whatsapp !== undefined) {
    output.whatsapp = body.whatsapp ? normalizePhone(body.whatsapp) : null;
  }

  if (body.mapsUrl !== undefined) {
    output.mapsUrl = optionalString(body.mapsUrl, 'mapsUrl', { max: 500 });
  }

  if (body.logoUrl !== undefined) {
    output.logoUrl = optionalString(body.logoUrl, 'logoUrl', { max: 500 });
  }

  return output;
}

export function clientPayload(body, { partial = false } = {}) {
  const output = {};

  if (!partial || body.fullName !== undefined) {
    output.fullName = requireString(body.fullName, 'fullName', { min: 2, max: 120 });
  }

  if (!partial || body.phone !== undefined) {
    output.phone = body.phone ? normalizePhone(body.phone) : null;
  }

  if (!partial || body.email !== undefined) {
    output.email = optionalEmail(body.email);
  }

  if (!partial || body.birthDate !== undefined) {
    output.birthDate = body.birthDate ? requireDate(body.birthDate, 'birthDate') : null;
  }

  if (!partial || body.notes !== undefined) {
    output.notes = optionalString(body.notes, 'notes', { max: 1000 });
  }

  if (!partial || body.marketingConsent !== undefined) {
    output.marketingConsent = optionalBoolean(body.marketingConsent) ?? false;
  }

  if (!partial || body.isActive !== undefined) {
    output.isActive = optionalBoolean(body.isActive) ?? true;
  }

  return output;
}

export function productPayload(body, { partial = false } = {}) {
  const output = {};

  if (!partial || body.name !== undefined) {
    output.name = requireString(body.name, 'name', { min: 2, max: 120 });
  }

  if (!partial || body.sku !== undefined) {
    output.sku = optionalString(body.sku, 'sku', { max: 40 });
  }

  if (!partial || body.category !== undefined) {
    output.category = optionalString(body.category, 'category', { max: 80 });
  }

  if (!partial || body.description !== undefined) {
    output.description = optionalString(body.description, 'description', { max: 1000 });
  }

  if (!partial || body.cost !== undefined) {
    output.cost =
      body.cost === undefined
        ? 0
        : requireNumber(body.cost, 'cost', { min: 0, max: 100_000_000 });
  }

  if (!partial || body.price !== undefined) {
    output.price = requireNumber(body.price, 'price', { min: 0, max: 100_000_000 });
  }

  if (!partial || body.stock !== undefined) {
    output.stock =
      body.stock === undefined ? 0 : requireInteger(body.stock, 'stock', { min: 0, max: 100_000 });
  }

  if (!partial || body.minStock !== undefined) {
    output.minStock =
      body.minStock === undefined
        ? 0
        : requireInteger(body.minStock, 'minStock', { min: 0, max: 100_000 });
  }

  if (!partial || body.imageUrl !== undefined) {
    output.imageUrl = optionalString(body.imageUrl, 'imageUrl', { max: 500 });
  }

  if (!partial || body.isActive !== undefined) {
    output.isActive = optionalBoolean(body.isActive) ?? true;
  }

  return output;
}

export function salePayload(body) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw ApiError.badRequest('La venta debe incluir al menos un ítem', 'INVALID_INPUT');
  }

  if (body.items.length > 50) {
    throw ApiError.badRequest('La venta no puede superar 50 ítems', 'INVALID_INPUT');
  }

  const items = body.items.map((item, index) => {
    const type = requireEnum(item.type, `items[${index}].type`, ['servicio', 'producto']);

    return {
      type,
      id: requireUuid(item.id, `items[${index}].id`),
      quantity: requireInteger(item.quantity ?? 1, `items[${index}].quantity`, {
        min: 1,
        max: 100,
      }),
    };
  });

  return {
    items,
    clientId: optionalUuid(body.clientId, 'clientId'),
    barberId: optionalUuid(body.barberId, 'barberId'),
    discount:
      body.discount === undefined
        ? 0
        : requireNumber(body.discount, 'discount', { min: 0, max: 100_000_000 }),
    method: requireEnum(body.method ?? 'efectivo', 'method', PAYMENT_METHODS),
    notes: optionalString(body.notes, 'notes', { max: 500 }),
  };
}

export function guestAppointmentPayload(body) {
  return {
    barberId: requireUuid(body.barberId, 'barberId'),
    serviceIds: parseUuidList(body.serviceIds, 'serviceIds'),
    startsAt: requireDateTime(body.startsAt, 'startsAt'),
    fullName: requireString(body.fullName, 'fullName', { min: 2, max: 120 }),
    phone: normalizePhone(body.phone),
    email: optionalEmail(body.email),
    notes: optionalString(body.notes, 'notes', { max: 500 }),
  };
}

export function staffAppointmentPayload(body) {
  return {
    barberId: requireUuid(body.barberId, 'barberId'),
    serviceIds: parseUuidList(body.serviceIds, 'serviceIds'),
    startsAt: requireDateTime(body.startsAt, 'startsAt'),
    fullName: requireString(body.fullName, 'fullName', { min: 2, max: 120 }),
    phone: body.phone ? normalizePhone(body.phone) : null,
    email: optionalEmail(body.email),
    notes: optionalString(body.notes, 'notes', { max: 500 }),
    source: requireEnum(body.source ?? 'mostrador', 'source', APPOINTMENT_SOURCES),
  };
}
