-- 003_funciones_triggers.sql
-- Reglas de negocio, disponibilidad, reservas, ventas y mÃ©tricas.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active
  );
$$;

create or replace function public.current_barber_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.barbers b
  join public.profiles p on p.id = b.profile_id
  where b.profile_id = auth.uid()
    and b.is_active
    and p.is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Perfiles de staff
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'staff'), '@', 1)
  );

  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    'barbero',
    left(v_name, 120),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.assert_barber_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_active boolean;
begin
  select role, is_active into v_role, v_active
  from public.profiles
  where id = new.profile_id;

  if not found then
    raise exception 'El perfil indicado no existe' using errcode = '22023';
  end if;

  if v_role <> 'barbero' then
    raise exception 'El perfil debe tener rol barbero' using errcode = '22023';
  end if;

  if not v_active then
    raise exception 'El perfil estÃ¡ inactivo' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_barbers_profile on public.barbers;
create trigger trg_barbers_profile
before insert or update of profile_id on public.barbers
for each row execute function public.assert_barber_profile();

-- ---------------------------------------------------------------------------
-- Totales de citas y ventas
-- ---------------------------------------------------------------------------

create or replace function public.calculate_appointment_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
begin
  select * into v_settings from public.settings where id = 1;

  if not found then
    raise exception 'La configuraciÃ³n del negocio no estÃ¡ inicializada' using errcode = 'P0001';
  end if;

  if new.discount > new.subtotal then
    raise exception 'El descuento no puede superar el subtotal' using errcode = '22023';
  end if;

  new.tax_amount := case
    when v_settings.prices_include_tax
      then round(new.subtotal * v_settings.tax_rate / (100 + v_settings.tax_rate))
    else round(new.subtotal * v_settings.tax_rate / 100)
  end;

  new.total := new.subtotal - new.discount
    + case when v_settings.prices_include_tax then 0 else new.tax_amount end;

  return new;
end;
$$;

drop trigger if exists trg_appointments_totals on public.appointments;
create trigger trg_appointments_totals
before insert or update on public.appointments
for each row execute function public.calculate_appointment_totals();

create or replace function public.calculate_sale_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
begin
  select * into v_settings from public.settings where id = 1;

  if not found then
    raise exception 'La configuraciÃ³n del negocio no estÃ¡ inicializada' using errcode = 'P0001';
  end if;

  if new.discount > new.subtotal then
    raise exception 'El descuento no puede superar el subtotal' using errcode = '22023';
  end if;

  new.tax_amount := case
    when v_settings.prices_include_tax
      then round(new.subtotal * v_settings.tax_rate / (100 + v_settings.tax_rate))
    else round(new.subtotal * v_settings.tax_rate / 100)
  end;

  new.total := new.subtotal - new.discount
    + case when v_settings.prices_include_tax then 0 else new.tax_amount end;

  return new;
end;
$$;

drop trigger if exists trg_sales_totals on public.sales;
create trigger trg_sales_totals
before insert or update on public.sales
for each row execute function public.calculate_sale_totals();

create or replace function public.set_appointment_service_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total := new.unit_price * new.quantity;
  return new;
end;
$$;

drop trigger if exists trg_appointment_services_total on public.appointment_services;
create trigger trg_appointment_services_total
before insert or update on public.appointment_services
for each row execute function public.set_appointment_service_total();

create or replace function public.recalc_appointment_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment_id uuid;
begin
  v_appointment_id := coalesce(new.appointment_id, old.appointment_id);

  update public.appointments
  set subtotal = coalesce((
    select sum(line_total)
    from public.appointment_services
    where appointment_id = v_appointment_id
  ), 0)
  where id = v_appointment_id;

  return null;
end;
$$;

drop trigger if exists trg_appointment_services_recalc on public.appointment_services;
create trigger trg_appointment_services_recalc
after insert or update or delete on public.appointment_services
for each row execute function public.recalc_appointment_subtotal();

create or replace function public.set_sale_item_total()
returns trigger
language plpgsql
as $$
begin
  new.line_total := new.unit_price * new.quantity;
  return new;
end;
$$;

drop trigger if exists trg_sale_items_total on public.sale_items;
create trigger trg_sale_items_total
before insert or update on public.sale_items
for each row execute function public.set_sale_item_total();

create or replace function public.recalc_sale_subtotal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  v_sale_id := coalesce(new.sale_id, old.sale_id);

  update public.sales
  set subtotal = coalesce((
    select sum(line_total)
    from public.sale_items
    where sale_id = v_sale_id
  ), 0)
  where id = v_sale_id;

  return null;
end;
$$;

drop trigger if exists trg_sale_items_recalc on public.sale_items;
create trigger trg_sale_items_recalc
after insert or update or delete on public.sale_items
for each row execute function public.recalc_sale_subtotal();

-- ---------------------------------------------------------------------------
-- Inventario y clientes
-- ---------------------------------------------------------------------------

create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.products
  set stock = stock + case
      when new.type = 'entrada' then new.quantity
      when new.type in ('salida', 'venta') then -new.quantity
      else new.quantity
    end,
    updated_at = now()
  where id = new.product_id;

  if not found then
    raise exception 'El producto indicado no existe' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stock_movements_apply on public.stock_movements;
create trigger trg_stock_movements_apply
after insert on public.stock_movements
for each row execute function public.apply_stock_movement();

create or replace function public.sync_client_last_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'completada' and old.status is distinct from 'completada' then
    update public.clients
    set last_visit_at = greatest(coalesce(last_visit_at, new.starts_at), new.starts_at)
    where id = new.client_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_appointments_last_visit on public.appointments;
create trigger trg_appointments_last_visit
after update of status on public.appointments
for each row execute function public.sync_client_last_visit();

create or replace function public.validate_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_barber_id uuid;
  v_status public.appointment_status;
begin
  select client_id, barber_id, status
  into v_client_id, v_barber_id, v_status
  from public.appointments
  where id = new.appointment_id;

  if not found then
    raise exception 'La cita indicada no existe' using errcode = '22023';
  end if;

  if v_status <> 'completada' then
    raise exception 'Solo se pueden reseÃ±ar citas completadas' using errcode = '22023';
  end if;

  new.client_id := v_client_id;
  new.barber_id := v_barber_id;
  return new;
end;
$$;

drop trigger if exists trg_reviews_validate on public.reviews;
create trigger trg_reviews_validate
before insert or update on public.reviews
for each row execute function public.validate_review();

-- ---------------------------------------------------------------------------
-- Disponibilidad
-- ---------------------------------------------------------------------------

create or replace function public.get_available_slots(
  p_barber_id uuid,
  p_date date,
  p_service_ids uuid[],
  p_exclude_appointment uuid default null
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
  v_services uuid[];
  v_duration integer;
  v_count integer;
begin
  select * into v_settings from public.settings where id = 1;

  if not found then
    raise exception 'La configuraciÃ³n del negocio no estÃ¡ inicializada' using errcode = 'P0001';
  end if;

  if p_date is null or p_service_ids is null or cardinality(p_service_ids) = 0 then
    return;
  end if;

  if not exists (
    select 1 from public.barbers where id = p_barber_id and is_active
  ) then
    return;
  end if;

  v_services := array(select distinct unnest(p_service_ids));

  select
    coalesce(sum(coalesce(bs.duration_override, s.duration_min) + s.buffer_min), 0),
    count(*)
  into v_duration, v_count
  from unnest(v_services) as sid
  join public.services s on s.id = sid and s.is_active
  join public.barber_services bs
    on bs.barber_id = p_barber_id and bs.service_id = s.id;

  if v_count <> cardinality(v_services) or v_duration <= 0 then
    return;
  end if;

  return query
  with candidates as (
    select
      slot_local at time zone v_settings.timezone as slot_start
    from public.barber_schedules sch
    cross join lateral generate_series(
      p_date + sch.start_time,
      p_date + sch.end_time - make_interval(mins => v_duration),
      make_interval(mins => v_settings.slot_interval_min)
    ) as slot_local
    where sch.barber_id = p_barber_id
      and sch.weekday = extract(dow from p_date)::smallint
      and sch.is_active
  )
  select
    c.slot_start,
    c.slot_start + make_interval(mins => v_duration) as slot_end
  from candidates c
  where c.slot_start >= now() + make_interval(mins => v_settings.min_advance_min)
    and c.slot_start <= now() + make_interval(days => v_settings.max_advance_days)
    and not exists (
      select 1
      from public.appointments a
      where a.barber_id = p_barber_id
        and a.status in ('pendiente', 'confirmada', 'en_curso')
        and (p_exclude_appointment is null or a.id <> p_exclude_appointment)
        and tstzrange(a.starts_at, a.ends_at, '[)')
            && tstzrange(c.slot_start, c.slot_start + make_interval(mins => v_duration), '[)')
    )
    and not exists (
      select 1
      from public.time_off t
      where (t.barber_id = p_barber_id or t.barber_id is null)
        and tstzrange(t.starts_at, t.ends_at, '[)')
            && tstzrange(c.slot_start, c.slot_start + make_interval(mins => v_duration), '[)')
    )
  order by c.slot_start;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reserva de invitados
-- ---------------------------------------------------------------------------

create or replace function public.book_appointment(
  p_barber_id uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_notes text default null,
  p_source public.appointment_source default 'web',
  p_created_by uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.settings%rowtype;
  v_services uuid[];
  v_duration integer;
  v_count integer;
  v_subtotal numeric(12, 0);
  v_client_id uuid;
  v_appointment public.appointments;
  v_active_count integer;
  v_phone text;
  v_email text;
begin
  select * into v_settings from public.settings where id = 1;

  if not found then
    raise exception 'La configuraciÃ³n del negocio no estÃ¡ inicializada' using errcode = 'P0001';
  end if;

  if p_full_name is null or length(btrim(p_full_name)) < 2 then
    raise exception 'El nombre del cliente es obligatorio' using errcode = '22023';
  end if;

  if p_starts_at is null then
    raise exception 'La fecha y hora son obligatorias' using errcode = '22023';
  end if;

  if p_service_ids is null or cardinality(p_service_ids) = 0 then
    raise exception 'Debes seleccionar al menos un servicio' using errcode = '22023';
  end if;

  if not exists (select 1 from public.barbers where id = p_barber_id and is_active) then
    raise exception 'El barbero no estÃ¡ disponible' using errcode = '22023';
  end if;

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'El telÃ©fono debe estar en formato internacional' using errcode = '22023';
  end if;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es vÃ¡lido' using errcode = '22023';
  end if;

  v_services := array(select distinct unnest(p_service_ids));

  select
    coalesce(sum(coalesce(bs.duration_override, s.duration_min) + s.buffer_min), 0),
    coalesce(sum(coalesce(bs.price_override, s.price)), 0),
    count(*)
  into v_duration, v_subtotal, v_count
  from unnest(v_services) as sid
  join public.services s on s.id = sid and s.is_active
  join public.barber_services bs
    on bs.barber_id = p_barber_id and bs.service_id = s.id;

  if v_count <> cardinality(v_services) or v_duration <= 0 then
    raise exception 'Uno o mÃ¡s servicios no estÃ¡n disponibles' using errcode = '22023';
  end if;

  -- Serializa reservas del mismo barbero para evitar carreras.
  perform pg_advisory_xact_lock(hashtext(p_barber_id::text)::bigint);

  if not exists (
    select 1
    from public.get_available_slots(
      p_barber_id,
      (p_starts_at at time zone v_settings.timezone)::date,
      v_services
    ) gs
    where gs.starts_at = p_starts_at
  ) then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
  end if;

  if v_phone is not null then
    insert into public.clients (full_name, phone, email)
    values (btrim(p_full_name), v_phone, v_email)
    on conflict (phone) do update
      set full_name = excluded.full_name,
          email = coalesce(excluded.email, public.clients.email),
          updated_at = now()
    returning id into v_client_id;
  else
    insert into public.clients (full_name, email)
    values (btrim(p_full_name), v_email)
    returning id into v_client_id;
  end if;

  select count(*) into v_active_count
  from public.appointments
  where client_id = v_client_id
    and status in ('pendiente', 'confirmada')
    and starts_at > now();

  if v_active_count >= 5 then
    raise exception 'El cliente ya tiene el mÃ¡ximo de citas activas' using errcode = 'P0003';
  end if;

  insert into public.appointments (
    client_id, barber_id, starts_at, ends_at, status, source,
    subtotal, notes, created_by
  )
  values (
    v_client_id,
    p_barber_id,
    p_starts_at,
    p_starts_at + make_interval(mins => v_duration),
    'pendiente',
    p_source,
    v_subtotal,
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_created_by
  )
  returning * into v_appointment;

  insert into public.appointment_services (
    appointment_id, service_id, name_snapshot, duration_min, unit_price, quantity, line_total
  )
  select
    v_appointment.id,
    s.id,
    s.name,
    coalesce(bs.duration_override, s.duration_min),
    coalesce(bs.price_override, s.price),
    1,
    coalesce(bs.price_override, s.price)
  from unnest(v_services) as sid
  join public.services s on s.id = sid
  join public.barber_services bs
    on bs.barber_id = p_barber_id and bs.service_id = s.id;

  select * into v_appointment from public.appointments where id = v_appointment.id;
  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
end;
$$;

create or replace function public.lookup_appointment(p_code text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'code', a.code,
    'status', a.status,
    'startsAt', a.starts_at,
    'endsAt', a.ends_at,
    'barber', jsonb_build_object(
      'id', b.id,
      'name', b.display_name,
      'photoUrl', b.photo_url
    ),
    'client', jsonb_build_object(
      'fullName', c.full_name,
      'phone', c.phone
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', aps.name_snapshot,
        'durationMin', aps.duration_min,
        'price', aps.unit_price
      ) order by aps.created_at)
      from public.appointment_services aps
      where aps.appointment_id = a.id
    ), '[]'::jsonb),
    'subtotal', a.subtotal,
    'discount', a.discount,
    'total', a.total,
    'notes', a.notes,
    'createdAt', a.created_at,
    'cancellationHours', st.cancellation_hours
  )
  from public.appointments a
  join public.clients c on c.id = a.client_id
  join public.barbers b on b.id = a.barber_id
  cross join public.settings st
  where a.code = upper(btrim(p_code))
    and c.phone = p_phone
  limit 1;
$$;

create or replace function public.cancel_appointment_by_code(
  p_code text,
  p_phone text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_hours integer;
begin
  select a.* into v_appointment
  from public.appointments a
  join public.clients c on c.id = a.client_id
  where a.code = upper(btrim(p_code))
    and c.phone = p_phone
  limit 1;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status not in ('pendiente', 'confirmada') then
    raise exception 'La cita ya no puede cancelarse' using errcode = 'P0006';
  end if;

  select cancellation_hours into v_hours from public.settings where id = 1;

  if now() > v_appointment.starts_at - make_interval(hours => coalesce(v_hours, 0)) then
    raise exception 'La cita estÃ¡ dentro del plazo mÃ­nimo de cancelaciÃ³n' using errcode = 'P0004';
  end if;

  update public.appointments
  set status = 'cancelada',
      cancelled_at = now(),
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = v_appointment.id;

  return jsonb_build_object(
    'code', v_appointment.code,
    'status', 'cancelada',
    'cancelledAt', now()
  );
end;
$$;

create or replace function public.reschedule_appointment_by_code(
  p_code text,
  p_phone text,
  p_starts_at timestamptz
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_services uuid[];
  v_settings public.settings%rowtype;
  v_new_end timestamptz;
  v_hours integer;
begin
  select * into v_settings from public.settings where id = 1;

  select a.* into v_appointment
  from public.appointments a
  join public.clients c on c.id = a.client_id
  where a.code = upper(btrim(p_code))
    and c.phone = p_phone
  limit 1;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status not in ('pendiente', 'confirmada') then
    raise exception 'La cita ya no puede reprogramarse' using errcode = 'P0006';
  end if;

  v_hours := v_settings.cancellation_hours;

  if now() > v_appointment.starts_at - make_interval(hours => v_hours) then
    raise exception 'La cita estÃ¡ dentro del plazo mÃ­nimo de cambios' using errcode = 'P0004';
  end if;

  select array_agg(service_id) into v_services
  from public.appointment_services
  where appointment_id = v_appointment.id;

  select gs.ends_at into v_new_end
  from public.get_available_slots(
    v_appointment.barber_id,
    (p_starts_at at time zone v_settings.timezone)::date,
    v_services,
    v_appointment.id
  ) gs
  where gs.starts_at = p_starts_at;

  if v_new_end is null then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
  end if;

  update public.appointments
  set starts_at = p_starts_at,
      ends_at = v_new_end
  where id = v_appointment.id
  returning * into v_appointment;

  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
end;
$$;

-- ---------------------------------------------------------------------------
-- Operaciones de staff
-- ---------------------------------------------------------------------------

create or replace function public.cancel_appointment(
  p_appointment_id uuid,
  p_reason text default null,
  p_actor uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
begin
  select * into v_appointment from public.appointments where id = p_appointment_id;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status not in ('pendiente', 'confirmada') then
    raise exception 'La cita ya no puede cancelarse' using errcode = 'P0006';
  end if;

  update public.appointments
  set status = 'cancelada',
      cancelled_at = now(),
      cancelled_by = p_actor,
      cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_appointment_id
  returning * into v_appointment;

  return v_appointment;
end;
$$;

create or replace function public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at timestamptz,
  p_actor uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_services uuid[];
  v_settings public.settings%rowtype;
  v_new_end timestamptz;
begin
  select * into v_settings from public.settings where id = 1;
  select * into v_appointment from public.appointments where id = p_appointment_id;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status not in ('pendiente', 'confirmada') then
    raise exception 'La cita ya no puede reprogramarse' using errcode = 'P0006';
  end if;

  select array_agg(service_id) into v_services
  from public.appointment_services
  where appointment_id = v_appointment.id;

  select gs.ends_at into v_new_end
  from public.get_available_slots(
    v_appointment.barber_id,
    (p_starts_at at time zone v_settings.timezone)::date,
    v_services,
    v_appointment.id
  ) gs
  where gs.starts_at = p_starts_at;

  if v_new_end is null then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
  end if;

  update public.appointments
  set starts_at = p_starts_at,
      ends_at = v_new_end
  where id = p_appointment_id
  returning * into v_appointment;

  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'El horario seleccionado ya no estÃ¡ disponible' using errcode = 'P0002';
end;
$$;

create or replace function public.set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status,
  p_actor uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
begin
  if p_status not in ('confirmada', 'en_curso', 'no_asistio') then
    raise exception 'Estado no permitido en esta operaciÃ³n' using errcode = '22023';
  end if;

  select * into v_appointment from public.appointments where id = p_appointment_id;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status in ('completada', 'cancelada') then
    raise exception 'La cita ya estÃ¡ cerrada' using errcode = 'P0006';
  end if;

  update public.appointments
  set status = p_status,
      cancelled_by = case when p_status = 'no_asistio' then p_actor else cancelled_by end,
      cancelled_at = case when p_status = 'no_asistio' then now() else cancelled_at end
  where id = p_appointment_id
  returning * into v_appointment;

  return v_appointment;
end;
$$;

create or replace function public.complete_appointment(
  p_appointment_id uuid,
  p_method public.payment_method,
  p_amount numeric default null,
  p_tip numeric default 0,
  p_actor uuid default null
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_amount numeric(12, 0);
begin
  select * into v_appointment from public.appointments where id = p_appointment_id;

  if not found then
    raise exception 'Cita no encontrada' using errcode = 'P0005';
  end if;

  if v_appointment.status not in ('pendiente', 'confirmada', 'en_curso') then
    raise exception 'La cita ya estÃ¡ cerrada' using errcode = 'P0006';
  end if;

  if exists (
    select 1 from public.payments where appointment_id = p_appointment_id
  ) then
    raise exception 'La cita ya tiene un pago registrado' using errcode = 'P0007';
  end if;

  v_amount := coalesce(p_amount, v_appointment.total);

  if v_amount is null or v_amount <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero' using errcode = '22023';
  end if;

  if coalesce(p_tip, 0) < 0 then
    raise exception 'La propina no puede ser negativa' using errcode = '22023';
  end if;

  update public.appointments
  set status = 'completada'
  where id = p_appointment_id
  returning * into v_appointment;

  insert into public.payments (
    appointment_id, amount, tip_amount, method, status, paid_at, created_by
  )
  values (
    p_appointment_id, v_amount, coalesce(p_tip, 0), p_method, 'pagado', now(), p_actor
  );

  return v_appointment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Caja e inventario
-- ---------------------------------------------------------------------------

create or replace function public.register_sale(
  p_items jsonb,
  p_client_id uuid default null,
  p_barber_id uuid default null,
  p_discount numeric default 0,
  p_method public.payment_method default 'efectivo',
  p_notes text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_item jsonb;
  v_type public.sale_item_type;
  v_id uuid;
  v_quantity integer;
  v_name text;
  v_price numeric(12, 0);
  v_stock integer;
  v_cost numeric(12, 0);
  v_subtotal numeric(12, 0) := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta debe incluir al menos un Ã­tem' using errcode = '22023';
  end if;

  if coalesce(p_discount, 0) < 0 then
    raise exception 'El descuento no puede ser negativo' using errcode = '22023';
  end if;

  insert into public.sales (client_id, barber_id, subtotal, discount, status, notes, created_by)
  values (p_client_id, p_barber_id, 0, 0, 'abierta', nullif(btrim(coalesce(p_notes, '')), ''), p_actor)
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_type := (v_item ->> 'type')::public.sale_item_type;
    v_id := (v_item ->> 'id')::uuid;
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 1);

    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'Cantidad invÃ¡lida' using errcode = '22023';
    end if;

    if v_type = 'servicio' then
      select name, price into v_name, v_price
      from public.services
      where id = v_id and is_active;

      if not found then
        raise exception 'Servicio no disponible' using errcode = '22023';
      end if;

      insert into public.sale_items (
        sale_id, item_type, service_id, name_snapshot, quantity, unit_price, line_total
      )
      values (v_sale.id, 'servicio', v_id, v_name, v_quantity, v_price, v_price * v_quantity);
    else
      select name, price, stock, cost into v_name, v_price, v_stock, v_cost
      from public.products
      where id = v_id and is_active
      for update;

      if not found then
        raise exception 'Producto no disponible' using errcode = '22023';
      end if;

      if v_stock < v_quantity then
        raise exception 'Stock insuficiente para %', v_name using errcode = 'P0008';
      end if;

      insert into public.sale_items (
        sale_id, item_type, product_id, name_snapshot, quantity, unit_price, line_total
      )
      values (v_sale.id, 'producto', v_id, v_name, v_quantity, v_price, v_price * v_quantity);

      insert into public.stock_movements (
        product_id, type, quantity, unit_cost, reason, reference_id, created_by
      )
      values (
        v_id, 'venta', v_quantity, v_cost,
        'Venta ' || v_sale.code, v_sale.id, p_actor
      );
    end if;

    v_subtotal := v_subtotal + (v_price * v_quantity);
  end loop;

  update public.sales
  set subtotal = v_subtotal,
      discount = coalesce(p_discount, 0),
      status = 'pagada'
  where id = v_sale.id
  returning * into v_sale;

  if v_sale.total > 0 then
    insert into public.payments (
      sale_id, amount, method, status, paid_at, created_by
    )
    values (
      v_sale.id, v_sale.total, p_method, 'pagado', now(), p_actor
    );
  end if;

  return jsonb_build_object(
    'id', v_sale.id,
    'code', v_sale.code,
    'subtotal', v_sale.subtotal,
    'discount', v_sale.discount,
    'taxAmount', v_sale.tax_amount,
    'total', v_sale.total,
    'status', v_sale.status
  );
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity integer,
  p_type public.stock_movement_type,
  p_reason text default null,
  p_actor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if p_type not in ('entrada', 'salida', 'ajuste') then
    raise exception 'Tipo de movimiento no permitido' using errcode = '22023';
  end if;

  if p_quantity = 0 then
    raise exception 'La cantidad no puede ser cero' using errcode = '22023';
  end if;

  if p_type <> 'ajuste' and p_quantity < 0 then
    raise exception 'La cantidad debe ser positiva' using errcode = '22023';
  end if;

  insert into public.stock_movements (
    product_id, type, quantity, reason, created_by
  )
  values (p_product_id, p_type, p_quantity, nullif(btrim(coalesce(p_reason, '')), ''), p_actor);

  select * into v_product from public.products where id = p_product_id;

  return jsonb_build_object(
    'id', v_product.id,
    'name', v_product.name,
    'stock', v_product.stock,
    'minStock', v_product.min_stock
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- MÃ©tricas
-- ---------------------------------------------------------------------------

create or replace function public.dashboard_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revenue numeric(14, 0);
  v_payments integer;
begin
  if p_from is null or p_to is null or p_from >= p_to then
    raise exception 'El rango de fechas no es vÃ¡lido' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0), count(*)
  into v_revenue, v_payments
  from public.payments
  where status = 'pagado'
    and paid_at >= p_from
    and paid_at < p_to;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'appointmentsTotal', (
      select count(*) from public.appointments
      where starts_at >= p_from and starts_at < p_to
    ),
    'completed', (
      select count(*) from public.appointments
      where starts_at >= p_from and starts_at < p_to and status = 'completada'
    ),
    'cancelled', (
      select count(*) from public.appointments
      where starts_at >= p_from and starts_at < p_to and status = 'cancelada'
    ),
    'noShow', (
      select count(*) from public.appointments
      where starts_at >= p_from and starts_at < p_to and status = 'no_asistio'
    ),
    'revenue', v_revenue,
    'tips', (
      select coalesce(sum(tip_amount), 0) from public.payments
      where status = 'pagado' and paid_at >= p_from and paid_at < p_to
    ),
    'serviceRevenue', (
      select coalesce(sum(p.amount), 0)
      from public.payments p
      join public.appointments a on a.id = p.appointment_id
      where p.status = 'pagado' and p.paid_at >= p_from and p.paid_at < p_to
    ),
    'productRevenue', (
      select coalesce(sum(p.amount), 0)
      from public.payments p
      join public.sales s on s.id = p.sale_id
      where p.status = 'pagado' and p.paid_at >= p_from and p.paid_at < p_to
    ),
    'newClients', (
      select count(*) from public.clients
      where created_at >= p_from and created_at < p_to
    ),
    'averageTicket', case when v_payments > 0 then round(v_revenue / v_payments) else 0 end,
    'lowStock', (
      select count(*) from public.products
      where is_active and stock <= min_stock
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers de updated_at
-- ---------------------------------------------------------------------------

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_barbers_updated on public.barbers;
create trigger trg_barbers_updated
before update on public.barbers
for each row execute function public.set_updated_at();

drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated
before update on public.clients
for each row execute function public.set_updated_at();

drop trigger if exists trg_service_categories_updated on public.service_categories;
create trigger trg_service_categories_updated
before update on public.service_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_services_updated on public.services;
create trigger trg_services_updated
before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists trg_barber_schedules_updated on public.barber_schedules;
create trigger trg_barber_schedules_updated
before update on public.barber_schedules
for each row execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated on public.appointments;
create trigger trg_appointments_updated
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists trg_sales_updated on public.sales;
create trigger trg_sales_updated
before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists trg_settings_updated on public.settings;
create trigger trg_settings_updated
before update on public.settings
for each row execute function public.set_updated_at();
