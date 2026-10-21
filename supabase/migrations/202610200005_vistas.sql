-- 005_vistas.sql
-- Vistas de consulta para agenda, clientes, caja e inventario.

create or replace view public.v_agenda
with (security_invoker = true)
as
select
  a.id,
  a.code,
  a.starts_at,
  a.ends_at,
  a.status,
  a.source,
  a.client_id,
  c.full_name as client_name,
  c.phone as client_phone,
  a.barber_id,
  b.display_name as barber_name,
  a.subtotal,
  a.discount,
  a.tax_amount,
  a.total,
  a.deposit,
  a.notes,
  a.internal_notes,
  a.created_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', aps.name_snapshot,
      'durationMin', aps.duration_min,
      'price', aps.unit_price,
      'quantity', aps.quantity
    ) order by aps.created_at)
    from public.appointment_services aps
    join public.services s on s.id = aps.service_id
    where aps.appointment_id = a.id
  ), '[]'::jsonb) as services
from public.appointments a
join public.clients c on c.id = a.client_id
join public.barbers b on b.id = a.barber_id;

comment on view public.v_agenda is 'Agenda enriquecida con cliente, barbero y servicios.';

create or replace view public.v_client_history
with (security_invoker = true)
as
select
  c.id,
  c.full_name,
  c.phone,
  c.email,
  c.birth_date,
  c.notes,
  c.marketing_consent,
  c.is_active,
  c.last_visit_at,
  c.created_at,
  count(a.id) filter (where a.status = 'completada') as completed_visits,
  coalesce(sum(a.total) filter (where a.status = 'completada'), 0) as total_spent,
  count(a.id) filter (where a.status in ('pendiente', 'confirmada')) as active_appointments,
  max(a.starts_at) filter (where a.status = 'completada') as last_appointment_at
from public.clients c
left join public.appointments a on a.client_id = c.id
group by c.id;

comment on view public.v_client_history is 'Historial agregado por cliente.';

create or replace view public.v_low_stock
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.sku,
  p.category,
  p.stock,
  p.min_stock,
  p.price,
  (p.stock <= p.min_stock) as is_low
from public.products p
where p.is_active;

comment on view public.v_low_stock is 'Productos activos con su estado de stock.';

create or replace view public.v_daily_revenue
with (security_invoker = true)
as
select
  (p.paid_at at time zone st.timezone)::date as day,
  count(*) as payment_count,
  coalesce(sum(p.amount), 0) as revenue,
  coalesce(sum(p.tip_amount), 0) as tips,
  coalesce(sum(p.amount) filter (where p.appointment_id is not null), 0) as service_revenue,
  coalesce(sum(p.amount) filter (where p.sale_id is not null), 0) as product_revenue
from public.payments p
cross join public.settings st
where p.status = 'pagado'
group by 1;

comment on view public.v_daily_revenue is 'Ingresos diarios según la zona horaria del negocio.';

create or replace view public.v_barber_commissions
with (security_invoker = true)
as
select
  b.id as barber_id,
  b.display_name,
  b.commission_rate,
  date_trunc('month', p.paid_at at time zone st.timezone)::date as month,
  count(p.id) as payment_count,
  coalesce(sum(p.amount), 0) as revenue,
  round(coalesce(sum(p.amount), 0) * b.commission_rate / 100) as commission
from public.barbers b
join public.appointments a on a.barber_id = b.id
join public.payments p on p.appointment_id = a.id and p.status = 'pagado'
cross join public.settings st
group by b.id, b.display_name, b.commission_rate, date_trunc('month', p.paid_at at time zone st.timezone);

comment on view public.v_barber_commissions is 'Comisiones mensuales por barbero.';

grant select on
  public.v_agenda,
  public.v_client_history,
  public.v_low_stock,
  public.v_daily_revenue,
  public.v_barber_commissions
to authenticated, service_role;

revoke all on
  public.v_agenda,
  public.v_client_history,
  public.v_low_stock,
  public.v_daily_revenue,
  public.v_barber_commissions
from anon;
