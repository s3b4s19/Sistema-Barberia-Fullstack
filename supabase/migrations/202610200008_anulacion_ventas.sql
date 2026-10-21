-- 008_anulacion_ventas.sql
-- Anulación de ventas, comprobantes internos y reportes por barbero.

-- ---------------------------------------------------------------------------
-- Datos de anulación y responsable del pago
-- ---------------------------------------------------------------------------

alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles (id) on delete set null,
  add column if not exists void_reason text;

alter table public.sales
  drop constraint if exists sales_void_reason_check;

alter table public.sales
  add constraint sales_void_reason_check check (
    void_reason is null or length(btrim(void_reason)) between 3 and 500
  );

alter table public.payments
  add column if not exists barber_id uuid references public.barbers (id) on delete set null;

create index if not exists sales_barber_created_idx
  on public.sales (barber_id, created_at desc);

create index if not exists payments_barber_paid_idx
  on public.payments (barber_id, paid_at desc);

-- Backfill de pagos existentes.
update public.payments p
set barber_id = a.barber_id
from public.appointments a
where p.barber_id is null
  and p.appointment_id = a.id;

update public.payments p
set barber_id = s.barber_id
from public.sales s
where p.barber_id is null
  and p.sale_id = s.id;

-- El trigger mantiene el barbero del pago sin tocar las RPC existentes.
create or replace function public.set_payment_barber()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.barber_id is null then
    if new.appointment_id is not null then
      select barber_id into new.barber_id
      from public.appointments
      where id = new.appointment_id;
    elsif new.sale_id is not null then
      select barber_id into new.barber_id
      from public.sales
      where id = new.sale_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_payments_barber on public.payments;
create trigger trg_payments_barber
before insert or update of appointment_id, sale_id on public.payments
for each row execute function public.set_payment_barber();

-- ---------------------------------------------------------------------------
-- Anulación de ventas
-- ---------------------------------------------------------------------------

create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item record;
  v_reason text;
begin
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  if v_reason is null or length(v_reason) < 3 then
    raise exception 'El motivo de anulación es obligatorio' using errcode = '22023';
  end if;

  if length(v_reason) > 500 then
    raise exception 'El motivo de anulación no puede superar 500 caracteres' using errcode = '22023';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0009';
  end if;

  if v_sale.status = 'anulada' then
    raise exception 'La venta ya fue anulada' using errcode = 'P0010';
  end if;

  if v_sale.status <> 'pagada' then
    raise exception 'Solo se pueden anular ventas pagadas' using errcode = 'P0011';
  end if;

  -- Reponer stock de los productos vendidos, dejando movimiento auditado.
  for v_item in
    select *
    from public.sale_items
    where sale_id = p_sale_id
      and item_type = 'producto'
  loop
    insert into public.stock_movements (
      product_id,
      type,
      quantity,
      reason,
      reference_id,
      created_by
    )
    values (
      v_item.product_id,
      'entrada',
      v_item.quantity,
      'Anulación ' || v_sale.code || ': ' || v_reason,
      v_sale.id,
      p_actor
    );
  end loop;

  -- Excluir el cobro de los ingresos sin borrar el historial.
  update public.payments
  set status = 'reembolsado'
  where sale_id = p_sale_id
    and status = 'pagado';

  update public.sales
  set status = 'anulada',
      voided_at = now(),
      voided_by = p_actor,
      void_reason = v_reason
  where id = p_sale_id
  returning * into v_sale;

  return jsonb_build_object(
    'id', v_sale.id,
    'code', v_sale.code,
    'status', v_sale.status,
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount,
    'taxAmount', v_sale.tax_amount,
    'total', v_sale.total,
    'voidedAt', v_sale.voided_at,
    'voidedBy', v_sale.voided_by,
    'voidReason', v_sale.void_reason
  );
end;
$$;

revoke all on function public.void_sale(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.void_sale(uuid, text, uuid) to service_role;
