-- 006_seed.sql
-- Datos iniciales. Los barberos se crean con server/scripts/create-staff.mjs
-- porque requieren un usuario en auth.users.

insert into public.settings (
  id, business_name, city, timezone, currency, locale, phone_prefix,
  slot_interval_min, min_advance_min, max_advance_days, cancellation_hours,
  deposit_percent, tax_rate, prices_include_tax
)
values (
  1, 'Barbería', 'Santiago', 'America/Santiago', 'CLP', 'es-CL', '+56',
  15, 60, 60, 12,
  0, 19.00, true
)
on conflict (id) do nothing;

insert into public.service_categories (name, slug, description, sort_order)
values
  ('Cortes', 'cortes', 'Cortes de cabello para adultos y niños.', 1),
  ('Barba', 'barba', 'Perfilado, afeitado y cuidado de barba.', 2),
  ('Cuidado facial', 'cuidado-facial', 'Servicios de cuidado para el rostro.', 3),
  ('Combos', 'combos', 'Servicios combinados con precio preferente.', 4)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

insert into public.services (
  category_id, name, slug, description, duration_min, buffer_min, price, sort_order
)
select c.id, v.name, v.slug, v.description, v.duration_min, v.buffer_min, v.price, v.sort_order
from (
  values
    ('cortes', 'Corte clásico', 'corte-clasico',
     'Corte con tijera y máquina, incluye lavado y peinado.', 30, 5, 12000, 1),
    ('cortes', 'Corte fade', 'corte-fade',
     'Degradado progresivo con acabado a máquina.', 35, 5, 14000, 2),
    ('cortes', 'Corte para niño', 'corte-nino',
     'Corte adaptado para menores de 12 años.', 30, 5, 10000, 3),
    ('cortes', 'Corte y barba', 'corte-y-barba',
     'Corte completo más perfilado de barba.', 50, 10, 20000, 4),
    ('barba', 'Perfilado de barba', 'perfilado-de-barba',
     'Definición de contornos con máquina y navaja.', 20, 5, 8000, 1),
    ('barba', 'Afeitado a navaja', 'afeitado-a-navaja',
     'Afeitado tradicional con toalla caliente.', 30, 5, 12000, 2),
    ('cuidado-facial', 'Diseño de cejas', 'diseno-de-cejas',
     'Perfilado de cejas con pinza y navaja.', 15, 5, 6000, 1),
    ('cuidado-facial', 'Mascarilla facial', 'mascarilla-facial',
     'Limpieza y mascarilla según tipo de piel.', 25, 5, 10000, 2),
    ('cuidado-facial', 'Lavado y peinado', 'lavado-y-peinado',
     'Lavado con productos profesionales y peinado.', 20, 5, 7000, 3),
    ('combos', 'Combo completo', 'combo-completo',
     'Corte, barba, cejas y mascarilla facial.', 75, 10, 28000, 1)
) as v(category_slug, name, slug, description, duration_min, buffer_min, price, sort_order)
join public.service_categories c on c.slug = v.category_slug
on conflict (slug) do nothing;

insert into public.products (name, sku, category, description, cost, price, stock, min_stock)
values
  ('Pomada clásica', 'POM-001', 'Estilizado', 'Pomada de fijación media.', 6000, 12000, 10, 3),
  ('Shampoo para barba', 'SHA-001', 'Cuidado', 'Shampoo suave para barba.', 5000, 10000, 8, 2),
  ('Cera mate', 'CER-001', 'Estilizado', 'Cera de acabado mate.', 7000, 13000, 6, 2)
on conflict (sku) do nothing;
