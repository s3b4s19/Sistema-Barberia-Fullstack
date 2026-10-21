import { supabaseAdmin } from '../config/supabase.js';
import { recordAudit } from '../lib/audit.js';
import { ApiError } from '../lib/errors.js';

function throwIf(error) {
  if (error) {
    throw error;
  }
}

function single(data) {
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function listProducts({ search = null, lowStock = false, limit = 100 } = {}) {
  let query = supabaseAdmin
    .from('products')
    .select('*')
    .order('name', { ascending: true })
    .limit(limit);

  if (search) {
    const safe = search.replace(/[%_,()]/g, ' ').trim();

    if (safe) {
      query = query.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,category.ilike.%${safe}%`);
    }
  }

  if (lowStock) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  throwIf(error);

  const items = data ?? [];
  return lowStock ? items.filter((product) => product.stock <= product.min_stock) : items;
}

export async function createProduct(input, actorId) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      name: input.name,
      sku: input.sku ?? null,
      category: input.category ?? null,
      description: input.description ?? null,
      cost: input.cost ?? 0,
      price: input.price,
      stock: input.stock ?? 0,
      min_stock: input.minStock ?? 0,
      image_url: input.imageUrl ?? null,
      is_active: input.isActive ?? true,
    })
    .select()
    .single();

  throwIf(error);

  await recordAudit({
    actorId,
    action: 'product.create',
    entity: 'products',
    entityId: data.id,
    after: data,
  });

  return data;
}

export async function updateProduct(id, input, actorId) {
  if (input.stock !== undefined) {
    throw ApiError.badRequest(
      'El stock se modifica desde el endpoint de ajuste de inventario',
      'USE_STOCK_ENDPOINT',
    );
  }

  const payload = {};

  if (input.name !== undefined) payload.name = input.name;
  if (input.sku !== undefined) payload.sku = input.sku;
  if (input.category !== undefined) payload.category = input.category;
  if (input.description !== undefined) payload.description = input.description;
  if (input.cost !== undefined) payload.cost = input.cost;
  if (input.price !== undefined) payload.price = input.price;
  if (input.minStock !== undefined) payload.min_stock = input.minStock;
  if (input.imageUrl !== undefined) payload.image_url = input.imageUrl;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  if (Object.keys(payload).length === 0) {
    throw ApiError.badRequest('No hay cambios para aplicar');
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(payload)
    .eq('id', id)
    .select()
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Producto no encontrado', 'PRODUCT_NOT_FOUND');
  }

  await recordAudit({
    actorId,
    action: 'product.update',
    entity: 'products',
    entityId: id,
    after: data,
  });

  return data;
}

export async function adjustProductStock(id, { quantity, type, reason }, actorId) {
  const { data, error } = await supabaseAdmin.rpc('adjust_stock', {
    p_product_id: id,
    p_quantity: quantity,
    p_type: type,
    p_reason: reason ?? null,
    p_actor: actorId,
  });

  throwIf(error);

  await recordAudit({
    actorId,
    action: 'product.stock',
    entity: 'products',
    entityId: id,
    after: data,
  });

  return data;
}

export async function listStockMovements(productId, { limit = 100 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('stock_movements')
    .select('*, products(name, sku)')
    .eq('product_id', productId)
    .order('created_at', { ascending: false })
    .limit(limit);

  throwIf(error);
  return data ?? [];
}

export async function registerSale(input, actorId) {
  const { data, error } = await supabaseAdmin.rpc('register_sale', {
    p_items: input.items,
    p_client_id: input.clientId ?? null,
    p_barber_id: input.barberId ?? null,
    p_discount: input.discount ?? 0,
    p_method: input.method,
    p_notes: input.notes ?? null,
    p_actor: actorId,
  });

  throwIf(error);

  const sale = single(data);

  if (!sale) {
    throw ApiError.internal('No se pudo registrar la venta');
  }

  await recordAudit({
    actorId,
    action: 'sale.create',
    entity: 'sales',
    entityId: sale.id,
    after: sale,
  });

  return sale;
}

export async function listSales({
  from = null,
  to = null,
  barberId = null,
  status = null,
  limit = 200,
} = {}) {
  let query = supabaseAdmin
    .from('sales')
    .select(
      '*, sale_items(*), payments(*), clients(full_name), barbers(display_name)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (from) {
    query = query.gte('created_at', from);
  }

  if (to) {
    query = query.lt('created_at', to);
  }

  if (barberId) {
    query = query.eq('barber_id', barberId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  throwIf(error);
  return data ?? [];
}

export async function getSaleById(id) {
  const { data, error } = await supabaseAdmin
    .from('sales')
    .select('*, sale_items(*), payments(*), clients(full_name), barbers(display_name)')
    .eq('id', id)
    .maybeSingle();

  throwIf(error);

  if (!data) {
    throw ApiError.notFound('Venta no encontrada', 'SALE_NOT_FOUND');
  }

  return data;
}

export async function voidSale(id, reason, actorId) {
  const { data, error } = await supabaseAdmin.rpc('void_sale', {
    p_sale_id: id,
    p_reason: reason,
    p_actor: actorId,
  });

  throwIf(error);

  const sale = single(data);

  if (!sale) {
    throw ApiError.internal('No se pudo anular la venta');
  }

  await recordAudit({
    actorId,
    action: 'sale.void',
    entity: 'sales',
    entityId: id,
    after: sale,
  });

  return getSaleById(id);
}

export async function listPayments({
  from = null,
  to = null,
  barberId = null,
  status = null,
  limit = 100,
} = {}) {
  let query = supabaseAdmin
    .from('payments')
    .select(
      '*, appointments(code, barbers(display_name)), sales(code, barbers(display_name))',
    )
    .order('paid_at', { ascending: false })
    .limit(limit);

  if (from) {
    query = query.gte('paid_at', from);
  }

  if (to) {
    query = query.lt('paid_at', to);
  }

  if (barberId) {
    query = query.eq('barber_id', barberId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  throwIf(error);

  return (data ?? []).map((payment) => ({
    ...payment,
    barber_name:
      payment.appointments?.barbers?.display_name ??
      payment.sales?.barbers?.display_name ??
      null,
  }));
}
