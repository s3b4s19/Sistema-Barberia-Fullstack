import { isProduction } from '../config/env.js';
import { ApiError } from '../lib/errors.js';

const MOJIBAKE = {
  'Ã¡': 'á',
  'Ã©': 'é',
  'Ã­': 'í',
  'Ã³': 'ó',
  'Ãº': 'ú',
  'Ã±': 'ñ',
  'Â¿': '¿',
  'Â¡': '¡',
};

function repairMojibake(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return Object.entries(MOJIBAKE).reduce(
    (text, [broken, fixed]) => text.split(broken).join(fixed),
    value,
  );
}

const PG_ERRORS = {
  P0001: [400, 'BUSINESS_RULE', 'La operación no cumple una regla del negocio'],
  P0002: [409, 'SLOT_UNAVAILABLE', 'El horario seleccionado ya no está disponible'],
  P0003: [409, 'ACTIVE_APPOINTMENT_LIMIT', 'El cliente alcanzó el máximo de citas activas'],
  P0004: [409, 'CANCELLATION_WINDOW', 'La cita está fuera del plazo permitido'],
  P0005: [404, 'APPOINTMENT_NOT_FOUND', 'Cita no encontrada'],
  P0006: [409, 'APPOINTMENT_CLOSED', 'La cita ya está cerrada'],
  P0007: [409, 'PAYMENT_ALREADY_EXISTS', 'La cita ya tiene un pago registrado'],
  P0008: [409, 'INSUFFICIENT_STOCK', 'No hay stock suficiente'],
  P0009: [404, 'SALE_NOT_FOUND', 'Venta no encontrada'],
  P0010: [409, 'SALE_ALREADY_VOIDED', 'La venta ya fue anulada'],
  P0011: [409, 'SALE_NOT_PAID', 'Solo se pueden anular ventas pagadas'],
  '23P01': [409, 'SLOT_UNAVAILABLE', 'El horario se superpone con otra cita'],
  '23505': [409, 'DUPLICATE', 'Ya existe un registro con esos datos'],
  '23503': [400, 'INVALID_REFERENCE', 'La referencia indicada no existe'],
  '23514': [400, 'CONSTRAINT_VIOLATION', 'Los datos no cumplen una restricción'],
  '22023': [400, 'INVALID_INPUT', 'Los datos enviados no son válidos'],
  '22P02': [400, 'INVALID_INPUT', 'El formato de un dato no es válido'],
  '42501': [403, 'FORBIDDEN', 'No tienes permisos para esta operación'],
  PGRST116: [404, 'NOT_FOUND', 'Recurso no encontrado'],
  PGRST301: [401, 'UNAUTHORIZED', 'Debes iniciar sesión'],
};

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }

  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: {
        code: 'INVALID_JSON',
        message: 'El cuerpo de la petición no es un JSON válido',
        details: null,
      },
    });
  }

  const mapped = PG_ERRORS[error?.code];

  if (mapped) {
    const [status, code, fallbackMessage] = mapped;

    return res.status(status).json({
      ok: false,
      error: {
        code,
        message: repairMojibake(error.message || fallbackMessage),
        details: isProduction ? null : { pgCode: error.code, hint: error.hint ?? null },
      },
    });
  }

  console.error('[api:error]', error);

  return res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error interno',
      details: isProduction ? null : { message: error?.message },
    },
  });
}
