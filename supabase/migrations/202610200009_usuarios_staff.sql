-- 009_usuarios_staff.sql
-- Nombre de usuario para el login del staff, además del correo.

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check check (
    username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
  );

-- Completa usuarios existentes desde la parte local del correo.
-- Los duplicados reciben un sufijo corto y estable para no romper el índice.
with candidates as (
  select
    p.id,
    lower(
      trim(
        both '._-' from regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g')
      )
    ) as base
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is null
    and u.email is not null
),
cleaned as (
  select
    id,
    case
      when length(base) >= 3 then left(base, 30)
      else 'staff'
    end as base
  from candidates
),
numbered as (
  select
    id,
    base,
    row_number() over (partition by base order by id) as rn
  from cleaned
),
final as (
  select
    id,
    case
      when rn = 1 then base
      else left(base, 24) || '.' || substr(replace(id::text, '-', ''), 1, 4)
    end as username
  from numbered
)
update public.profiles p
set username = f.username
from final f
where p.id = f.id
  and f.username ~ '^[a-z0-9][a-z0-9._-]{2,29}$';

create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username))
  where username is not null;
