import { created, ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import {
  optionalString,
  optionalUuid,
  parsePagination,
  requireDateTime,
  requireEnum,
  requireInteger,
  requireString,
  requireUuid,
} from '../lib/validation.js';
import { PAYMENT_METHODS, productPayload, salePayload } from '../lib/payloads.js';
import {
  adjustProductStock,
  createProduct,
  getSaleById,
  listPayments,
  listProducts,
  listSales,
  listStockMovements,
  registerSale,
  updateProduct,
  voidSale,
} from '../services/inventory.service.js';

export async function products(req, res) {
  const search = req.query.search
    ? requireString(req.query.search, 'search', { min: 1, max: 80 })
    : null;
  const lowStock = req.query.lowStock === 'true';

  return ok(res, await listProducts({ search, lowStock, limit: 200 }));
}

export async function createProductHandler(req, res) {
  return created(res, await createProduct(productPayload(req.body ?? {}), req.user.id));
}

export async function updateProductHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(
    res,
    await updateProduct(id, productPayload(req.body ?? {}, { partial: true }), req.user.id),
  );
}

export async function stock(req, res) {
  const body = req.body ?? {};
  const id = requireUuid(req.params.id, 'id');
  const type = requireEnum(body.type, 'type', ['entrada', 'salida', 'ajuste']);
  const quantity = requireInteger(body.quantity, 'quantity', {
    min: type === 'ajuste' ? -100_000 : 1,
    max: 100_000,
  });

  if (type !== 'ajuste' && quantity <= 0) {
    throw ApiError.badRequest('La cantidad debe ser positiva', 'INVALID_INPUT');
  }

  const reason = optionalString(body.reason, 'reason', { max: 500 });

  return ok(res, await adjustProductStock(id, { quantity, type, reason }, req.user.id));
}

export async function movements(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await listStockMovements(id));
}

export async function sales(req, res) {
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : null;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : null;
  const barberId = optionalUuid(req.query.barberId, 'barberId');
  const status = req.query.status
    ? requireEnum(req.query.status, 'status', ['abierta', 'pagada', 'anulada'])
    : null;

  if (from && to && new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  return ok(res, await listSales({ from, to, barberId, status, limit: 200 }));
}

export async function createSale(req, res) {
  return created(res, await registerSale(salePayload(req.body ?? {}), req.user.id));
}

export async function saleById(req, res) {
  const id = requireUuid(req.params.id, 'id');
  return ok(res, await getSaleById(id));
}

export async function voidSaleHandler(req, res) {
  const id = requireUuid(req.params.id, 'id');
  const reason = requireString((req.body ?? {}).reason, 'reason', { min: 3, max: 500 });
  return ok(res, await voidSale(id, reason, req.user.id));
}

export async function payments(req, res) {
  const from = req.query.from ? requireDateTime(req.query.from, 'from') : null;
  const to = req.query.to ? requireDateTime(req.query.to, 'to') : null;
  const barberId = optionalUuid(req.query.barberId, 'barberId');
  const status = req.query.status
    ? requireEnum(req.query.status, 'status', ['pendiente', 'pagado', 'reembolsado', 'fallido'])
    : null;

  if (from && to && new Date(from) >= new Date(to)) {
    throw ApiError.badRequest('El rango de fechas no es válido', 'INVALID_RANGE');
  }

  const { limit } = parsePagination({ limit: req.query.limit ?? 100 });
  return ok(res, await listPayments({ from, to, barberId, status, limit }));
}

export async function paymentMethods(_req, res) {
  return ok(res, PAYMENT_METHODS);
}
