-- 001_extensions_y_enums.sql
-- Sistema de barbería: extensiones y tipos enumerados.
-- Ejecutar primero, sobre un proyecto Supabase vacío.

create extension if not exists btree_gist with schema public;
create extension if not exists pg_trgm with schema public;

-- Permite resolver operadores de btree_gist si la extensión ya existía en
-- el esquema "extensions" de Supabase.
set search_path = public, extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'barbero');
  end if;

  if not exists (select 1 from pg_type where typname = 'appointment_status') then
    create type public.appointment_status as enum (
      'pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_asistio'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'appointment_source') then
    create type public.appointment_source as enum ('web', 'mostrador', 'telefono', 'whatsapp');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('efectivo', 'tarjeta', 'transferencia', 'otro');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pendiente', 'pagado', 'reembolsado', 'fallido');
  end if;

  if not exists (select 1 from pg_type where typname = 'sale_status') then
    create type public.sale_status as enum ('abierta', 'pagada', 'anulada');
  end if;

  if not exists (select 1 from pg_type where typname = 'sale_item_type') then
    create type public.sale_item_type as enum ('servicio', 'producto');
  end if;

  if not exists (select 1 from pg_type where typname = 'stock_movement_type') then
    create type public.stock_movement_type as enum ('entrada', 'salida', 'ajuste', 'venta');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_channel') then
    create type public.notification_channel as enum ('email', 'whatsapp', 'sms');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pendiente', 'enviado', 'fallido');
  end if;
end
$$;
