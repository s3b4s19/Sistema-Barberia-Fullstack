-- 004_rls.sql
-- RLS deny-by-default. El acceso pÃºblico pasa por la API con service_role.
-- El staff autenticado solo puede leer lo que le corresponde; las escrituras
-- se ejecutan mediante RPC disponibles exclusivamente para service_role.

alter table public.profiles enable row level security;
alter table public.barbers enable row level security;
alter table public.clients enable row level security;
alter table public.service_categories enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.time_off enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_services enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.settings enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Privilegios: sin escrituras directas para anon ni authenticated
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- service_role es el rol del backend; se deja explícito para no depender
-- de los privilegios por defecto del proyecto Supabase.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on
  public.profiles,
  public.barbers,
  public.clients,
  public.service_categories,
  public.services,
  public.barber_services,
  public.barber_schedules,
  public.time_off,
  public.appointments,
  public.appointment_services,
  public.products,
  public.sales,
  public.sale_items,
  public.stock_movements,
  public.payments,
  public.reviews,
  public.notifications,
  public.settings,
  public.audit_log
to authenticated;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create policy "profiles_select_self" on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy "profiles_select_admin" on public.profiles
for select to authenticated
using ((select public.is_admin()));

create policy "barbers_select_self" on public.barbers
for select to authenticated
using (profile_id = (select auth.uid()));

create policy "barbers_select_admin" on public.barbers
for select to authenticated
using ((select public.is_admin()));

create policy "clients_select_admin" on public.clients
for select to authenticated
using ((select public.is_admin()));

create policy "clients_select_barber" on public.clients
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.client_id = public.clients.id
      and a.barber_id = (select public.current_barber_id())
  )
);

-- ---------------------------------------------------------------------------
-- CatÃ¡logo y configuraciÃ³n
-- ---------------------------------------------------------------------------

create policy "service_categories_select_staff" on public.service_categories
for select to authenticated using (true);

create policy "services_select_staff" on public.services
for select to authenticated using (true);

create policy "barber_services_select_staff" on public.barber_services
for select to authenticated using (true);

create policy "barber_schedules_select_staff" on public.barber_schedules
for select to authenticated using (true);

create policy "settings_select_staff" on public.settings
for select to authenticated using (true);

create policy "products_select_staff" on public.products
for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------

create policy "appointments_select_admin" on public.appointments
for select to authenticated
using ((select public.is_admin()));

create policy "appointments_select_barber" on public.appointments
for select to authenticated
using (barber_id = (select public.current_barber_id()));

create policy "appointment_services_select_admin" on public.appointment_services
for select to authenticated
using ((select public.is_admin()));

create policy "appointment_services_select_barber" on public.appointment_services
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.id = public.appointment_services.appointment_id
      and a.barber_id = (select public.current_barber_id())
  )
);

create policy "time_off_select_admin" on public.time_off
for select to authenticated
using ((select public.is_admin()));

create policy "time_off_select_barber" on public.time_off
for select to authenticated
using (barber_id is null or barber_id = (select public.current_barber_id()));

-- ---------------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------------

create policy "sales_select_admin" on public.sales
for select to authenticated
using ((select public.is_admin()));

create policy "sales_select_barber" on public.sales
for select to authenticated
using (barber_id = (select public.current_barber_id()));

create policy "sale_items_select_admin" on public.sale_items
for select to authenticated
using ((select public.is_admin()));

create policy "sale_items_select_barber" on public.sale_items
for select to authenticated
using (
  exists (
    select 1
    from public.sales s
    where s.id = public.sale_items.sale_id
      and s.barber_id = (select public.current_barber_id())
  )
);

create policy "payments_select_admin" on public.payments
for select to authenticated
using ((select public.is_admin()));

create policy "payments_select_barber" on public.payments
for select to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.id = public.payments.appointment_id
      and a.barber_id = (select public.current_barber_id())
  )
  or exists (
    select 1
    from public.sales s
    where s.id = public.payments.sale_id
      and s.barber_id = (select public.current_barber_id())
  )
);

create policy "stock_movements_select_admin" on public.stock_movements
for select to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- ReseÃ±as, notificaciones y auditorÃ­a
-- ---------------------------------------------------------------------------

create policy "reviews_select_admin" on public.reviews
for select to authenticated
using ((select public.is_admin()));

create policy "reviews_select_barber" on public.reviews
for select to authenticated
using (barber_id = (select public.current_barber_id()));

create policy "notifications_select_admin" on public.notifications
for select to authenticated
using ((select public.is_admin()));

create policy "audit_log_select_admin" on public.audit_log
for select to authenticated
using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- RPC de negocio: solo service_role
-- ---------------------------------------------------------------------------

revoke execute on function public.get_available_slots(uuid, date, uuid[], uuid) from public, anon, authenticated;
revoke execute on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text, text, public.appointment_source, uuid) from public, anon, authenticated;
revoke execute on function public.lookup_appointment(text, text) from public, anon, authenticated;
revoke execute on function public.cancel_appointment_by_code(text, text, text) from public, anon, authenticated;
revoke execute on function public.reschedule_appointment_by_code(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.cancel_appointment(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.reschedule_appointment(uuid, timestamptz, uuid) from public, anon, authenticated;
revoke execute on function public.set_appointment_status(uuid, public.appointment_status, uuid) from public, anon, authenticated;
revoke execute on function public.complete_appointment(uuid, public.payment_method, numeric, numeric, uuid) from public, anon, authenticated;
revoke execute on function public.register_sale(jsonb, uuid, uuid, numeric, public.payment_method, text, uuid) from public, anon, authenticated;
revoke execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, uuid) from public, anon, authenticated;
revoke execute on function public.dashboard_metrics(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.get_available_slots(uuid, date, uuid[], uuid) to service_role;
grant execute on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text, text, public.appointment_source, uuid) to service_role;
grant execute on function public.lookup_appointment(text, text) to service_role;
grant execute on function public.cancel_appointment_by_code(text, text, text) to service_role;
grant execute on function public.reschedule_appointment_by_code(text, text, timestamptz) to service_role;
grant execute on function public.cancel_appointment(uuid, text, uuid) to service_role;
grant execute on function public.reschedule_appointment(uuid, timestamptz, uuid) to service_role;
grant execute on function public.set_appointment_status(uuid, public.appointment_status, uuid) to service_role;
grant execute on function public.complete_appointment(uuid, public.payment_method, numeric, numeric, uuid) to service_role;
grant execute on function public.register_sale(jsonb, uuid, uuid, numeric, public.payment_method, text, uuid) to service_role;
grant execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text, uuid) to service_role;
grant execute on function public.dashboard_metrics(timestamptz, timestamptz) to service_role;
