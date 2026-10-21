-- 002_tablas.sql
-- Tablas, constraints e índices del sistema de barbería.

set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'barbero',
  full_name text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_check check (length(btrim(full_name)) between 2 and 120),
  constraint profiles_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$')
);

comment on table public.profiles is 'Perfil del personal. Solo admin y barberos inician sesión.';

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  display_name text not null,
  bio text,
  photo_url text,
  accent_color text not null default '#3f4a5a',
  commission_rate numeric(5, 2) not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barbers_display_name_check check (length(btrim(display_name)) between 2 and 80),
  constraint barbers_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint barbers_commission_check check (commission_rate between 0 and 100)
);

-- ---------------------------------------------------------------------------
-- Clientes (invitados, sin cuenta)
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text unique,
  email text,
  birth_date date,
  notes text,
  marketing_consent boolean not null default false,
  is_active boolean not null default true,
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_full_name_check check (length(btrim(full_name)) between 2 and 120),
  constraint clients_phone_check check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint clients_email_check check (
    email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint clients_birth_date_check check (birth_date is null or birth_date < current_date)
);

comment on table public.clients is 'Clientes atendidos. Se identifican por teléfono; no tienen login.';

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_categories_name_check check (length(btrim(name)) between 2 and 80),
  constraint service_categories_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  duration_min integer not null,
  buffer_min integer not null default 5,
  price numeric(12, 0) not null,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name_check check (length(btrim(name)) between 2 and 120),
  constraint services_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint services_duration_check check (duration_min between 5 and 480),
  constraint services_buffer_check check (buffer_min between 0 and 120),
  constraint services_price_check check (price >= 0)
);

create table if not exists public.barber_services (
  barber_id uuid not null references public.barbers (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  price_override numeric(12, 0),
  duration_override integer,
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id),
  constraint barber_services_price_check check (price_override is null or price_override >= 0),
  constraint barber_services_duration_check check (
    duration_override is null or duration_override between 5 and 480
  )
);

-- ---------------------------------------------------------------------------
-- Horarios y bloqueos
-- ---------------------------------------------------------------------------

create table if not exists public.barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers (id) on delete cascade,
  weekday smallint not null,
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_schedules_weekday_check check (weekday between 0 and 6),
  constraint barber_schedules_range_check check (start_time < end_time),
  constraint barber_schedules_unique unique (barber_id, weekday, start_time)
);

comment on column public.barber_schedules.weekday is '0 = domingo, 1 = lunes, ... 6 = sábado.';

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid references public.barbers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint time_off_range_check check (starts_at < ends_at)
);

comment on table public.time_off is 'Bloqueos puntuales. barber_id NULL significa local cerrado.';

-- ---------------------------------------------------------------------------
-- Citas
-- ---------------------------------------------------------------------------

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default (
    'CITA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  client_id uuid not null references public.clients (id) on delete restrict,
  barber_id uuid not null references public.barbers (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'pendiente',
  source public.appointment_source not null default 'web',
  subtotal numeric(12, 0) not null default 0,
  discount numeric(12, 0) not null default 0,
  tax_amount numeric(12, 0) not null default 0,
  total numeric(12, 0) not null default 0,
  deposit numeric(12, 0) not null default 0,
  notes text,
  internal_notes text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancellation_reason text,
  reminder_sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_range_check check (ends_at > starts_at),
  constraint appointments_subtotal_check check (subtotal >= 0),
  constraint appointments_discount_check check (discount >= 0 and discount <= subtotal),
  constraint appointments_tax_check check (tax_amount >= 0),
  constraint appointments_total_check check (total >= 0),
  constraint appointments_deposit_check check (deposit >= 0),
  constraint appointments_no_barber_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pendiente', 'confirmada', 'en_curso')),
  constraint appointments_no_client_overlap exclude using gist (
    client_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pendiente', 'confirmada', 'en_curso'))
);

comment on constraint appointments_no_barber_overlap on public.appointments is
  'Impide dos citas activas del mismo barbero en horarios superpuestos.';

create table if not exists public.appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  name_snapshot text not null,
  duration_min integer not null,
  unit_price numeric(12, 0) not null,
  quantity integer not null default 1,
  line_total numeric(12, 0) not null,
  created_at timestamptz not null default now(),
  constraint appointment_services_unique unique (appointment_id, service_id),
  constraint appointment_services_duration_check check (duration_min between 5 and 480),
  constraint appointment_services_price_check check (unit_price >= 0),
  constraint appointment_services_quantity_check check (quantity between 1 and 20),
  constraint appointment_services_total_check check (line_total >= 0)
);

-- ---------------------------------------------------------------------------
-- Inventario, ventas y pagos
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  category text,
  description text,
  cost numeric(12, 0) not null default 0,
  price numeric(12, 0) not null,
  stock integer not null default 0,
  min_stock integer not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_check check (length(btrim(name)) between 2 and 120),
  constraint products_cost_check check (cost >= 0),
  constraint products_price_check check (price >= 0),
  constraint products_stock_check check (stock >= 0),
  constraint products_min_stock_check check (min_stock >= 0)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default (
    'VENTA-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  client_id uuid references public.clients (id) on delete set null,
  barber_id uuid references public.barbers (id) on delete set null,
  subtotal numeric(12, 0) not null default 0,
  discount numeric(12, 0) not null default 0,
  tax_amount numeric(12, 0) not null default 0,
  total numeric(12, 0) not null default 0,
  status public.sale_status not null default 'abierta',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_subtotal_check check (subtotal >= 0),
  constraint sales_discount_check check (discount >= 0 and discount <= subtotal),
  constraint sales_tax_check check (tax_amount >= 0),
  constraint sales_total_check check (total >= 0)
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  item_type public.sale_item_type not null,
  service_id uuid references public.services (id) on delete restrict,
  product_id uuid references public.products (id) on delete restrict,
  name_snapshot text not null,
  quantity integer not null default 1,
  unit_price numeric(12, 0) not null,
  line_total numeric(12, 0) not null,
  created_at timestamptz not null default now(),
  constraint sale_items_parent_check check (
    (item_type = 'servicio' and service_id is not null and product_id is null)
    or (item_type = 'producto' and product_id is not null and service_id is null)
  ),
  constraint sale_items_quantity_check check (quantity between 1 and 100),
  constraint sale_items_price_check check (unit_price >= 0),
  constraint sale_items_total_check check (line_total >= 0)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  type public.stock_movement_type not null,
  quantity integer not null,
  unit_cost numeric(12, 0),
  reason text,
  reference_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint stock_movements_quantity_check check (quantity <> 0),
  constraint stock_movements_sign_check check (type = 'ajuste' or quantity > 0),
  constraint stock_movements_cost_check check (unit_cost is null or unit_cost >= 0)
);

comment on column public.stock_movements.quantity is
  'Positiva para entrada/salida/venta. En ajuste puede ser negativa.';

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  sale_id uuid references public.sales (id) on delete cascade,
  amount numeric(12, 0) not null,
  tip_amount numeric(12, 0) not null default 0,
  method public.payment_method not null,
  status public.payment_status not null default 'pagado',
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint payments_amount_check check (amount > 0),
  constraint payments_tip_check check (tip_amount >= 0),
  constraint payments_parent_check check (num_nonnulls(appointment_id, sale_id) = 1)
);

-- ---------------------------------------------------------------------------
-- Reseñas, notificaciones, configuración y auditoría
-- ---------------------------------------------------------------------------

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  barber_id uuid not null references public.barbers (id) on delete cascade,
  rating smallint not null,
  comment text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint reviews_rating_check check (rating between 1 and 5),
  constraint reviews_comment_check check (comment is null or length(comment) <= 1000)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments (id) on delete cascade,
  channel public.notification_channel not null,
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.notification_status not null default 'pendiente',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id smallint primary key default 1,
  business_name text not null,
  legal_name text,
  tax_id text,
  phone text,
  email text,
  address text,
  city text,
  timezone text not null default 'America/Santiago',
  currency text not null default 'CLP',
  locale text not null default 'es-CL',
  phone_prefix text not null default '+56',
  slot_interval_min smallint not null default 15,
  min_advance_min integer not null default 60,
  max_advance_days integer not null default 60,
  cancellation_hours integer not null default 12,
  deposit_percent numeric(5, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 19.00,
  prices_include_tax boolean not null default true,
  instagram text,
  whatsapp text,
  maps_url text,
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint settings_singleton_check check (id = 1),
  constraint settings_slot_interval_check check (slot_interval_min in (5, 10, 15, 20, 30, 45, 60)),
  constraint settings_advance_check check (min_advance_min >= 0),
  constraint settings_max_days_check check (max_advance_days between 1 and 365),
  constraint settings_cancellation_check check (cancellation_hours >= 0),
  constraint settings_deposit_check check (deposit_percent between 0 and 100),
  constraint settings_tax_check check (tax_rate between 0 and 100)
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

create index if not exists barbers_active_idx on public.barbers (is_active, sort_order);
create index if not exists clients_name_trgm_idx on public.clients using gin (full_name gin_trgm_ops);
create index if not exists clients_created_idx on public.clients (created_at desc);

create index if not exists services_category_idx on public.services (category_id, sort_order);
create index if not exists services_active_idx on public.services (is_active);

create index if not exists barber_schedules_barber_idx on public.barber_schedules (barber_id, weekday);
create index if not exists time_off_barber_range_idx on public.time_off (barber_id, starts_at);

create index if not exists appointments_starts_idx on public.appointments (starts_at);
create index if not exists appointments_barber_starts_idx on public.appointments (barber_id, starts_at);
create index if not exists appointments_client_starts_idx on public.appointments (client_id, starts_at desc);
create index if not exists appointments_status_idx on public.appointments (status);
create index if not exists appointment_services_appointment_idx on public.appointment_services (appointment_id);

create index if not exists products_sku_idx on public.products (sku);
create index if not exists products_low_stock_idx on public.products (stock, min_stock) where is_active;
create index if not exists sales_created_idx on public.sales (created_at desc);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create index if not exists payments_paid_at_idx on public.payments (paid_at desc);
create index if not exists payments_appointment_idx on public.payments (appointment_id);
create index if not exists payments_sale_idx on public.payments (sale_id);

create index if not exists reviews_barber_idx on public.reviews (barber_id, created_at desc);
create index if not exists notifications_appointment_idx on public.notifications (appointment_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
