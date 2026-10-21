# Esquema de base de datos

Proyecto Supabase/PostgreSQL para una barbería en Chile. Una sede, staff con login y clientes invitados sin cuenta.

## Migraciones

Ejecutar en orden en el SQL Editor de Supabase o con Supabase CLI:

| Archivo | Contenido |
|---|---|
| `202610200001_extensions_y_enums.sql` | `btree_gist`, `pg_trgm` y tipos enumerados |
| `202610200002_tablas.sql` | Tablas, constraints e índices |
| `202610200003_funciones_triggers.sql` | Reglas de negocio, triggers y RPC |
| `202610200004_rls.sql` | RLS, privilegios y permisos de ejecución |
| `202610200005_vistas.sql` | Vistas de agenda, clientes y caja |
| `202610200006_seed.sql` | Configuración, servicios y productos iniciales |
| `202610200007_reviews_ocultas_por_defecto.sql` | Reseñas ocultas por defecto |
| `202610200008_anulacion_ventas.sql` | Anulación de ventas, pagos por barbero e índices |
| `202610200009_usuarios_staff.sql` | Nombre de usuario de staff y backfill desde el correo |

## Enums

| Enum | Valores |
|---|---|
| `app_role` | `admin`, `barbero` |
| `appointment_status` | `pendiente`, `confirmada`, `en_curso`, `completada`, `cancelada`, `no_asistio` |
| `appointment_source` | `web`, `mostrador`, `telefono`, `whatsapp` |
| `payment_method` | `efectivo`, `tarjeta`, `transferencia`, `otro` |
| `payment_status` | `pendiente`, `pagado`, `reembolsado`, `fallido` |
| `sale_status` | `abierta`, `pagada`, `anulada` |
| `sale_item_type` | `servicio`, `producto` |
| `stock_movement_type` | `entrada`, `salida`, `ajuste`, `venta` |
| `notification_channel` | `email`, `whatsapp`, `sms` |
| `notification_status` | `pendiente`, `enviado`, `fallido` |

## Tablas

### Staff

- **`profiles`**: extiende `auth.users`. `id`, `role`, `full_name`, `phone`, `username` único case-insensitive, `avatar_url`, `is_active`.
- **`barbers`**: ficha profesional. `profile_id` único, `display_name`, `bio`, `photo_url`, `accent_color`, `commission_rate`, `sort_order`, `is_active`.
- **`profiles.username`**: alias de login único case-insensitive, 3–30 caracteres, minúsculas, números, punto, guion o guion bajo. Se completa desde el correo en la migración `009` y puede editarse desde la ficha del barbero.

### Clientes

- **`clients`**: clientes sin login. `full_name`, `phone` único, `email`, `birth_date`, `notes`, `marketing_consent`, `last_visit_at`, `is_active`.

### Catálogo

- **`service_categories`**: `name`, `slug`, `description`, `sort_order`, `is_active`.
- **`services`**: `category_id`, `name`, `slug`, `duration_min`, `buffer_min`, `price`, `is_active`.
- **`barber_services`**: qué servicios ofrece cada barbero. PK `(barber_id, service_id)`, con `price_override` y `duration_override`.

### Horarios

- **`barber_schedules`**: turnos semanales. `weekday` (0 domingo a 6 sábado), `start_time`, `end_time`, `is_active`. Un barbero puede tener varios turnos por día.
- **`time_off`**: bloqueos puntuales. `barber_id` NULL significa local cerrado.

### Citas

- **`appointments`**: `code`, `client_id`, `barber_id`, `starts_at`, `ends_at`, `status`, `source`, `subtotal`, `discount`, `tax_amount`, `total`, `deposit`, `notes`, `internal_notes`, datos de cancelación y recordatorio.
- **`appointment_services`**: servicios de cada cita con `name_snapshot`, `duration_min`, `unit_price`, `quantity` y `line_total`.

### Caja e inventario

- **`products`**: `name`, `sku`, `category`, `cost`, `price`, `stock`, `min_stock`, `is_active`.
- **`stock_movements`**: `type`, `quantity`, `unit_cost`, `reason`, `reference_id`.
- **`sales`**: venta de mostrador. `code`, `client_id`, `barber_id`, totales, `status` y datos de anulación (`voided_at`, `voided_by`, `void_reason`).
- **`sale_items`**: servicios o productos vendidos con precio histórico.
- **`payments`**: pago de una cita o de una venta. `amount`, `tip_amount`, `method`, `status`, `paid_at` y `barber_id` para reportes por barbero.

### Complementos

- **`reviews`**: una reseña por cita completada, con `rating` de 1 a 5. Nace con `is_published = false` por defecto (migración 007 aplicada) y requiere moderación del administrador. La API también fuerza ese valor al crearla.
- **`notifications`**: cola preparada para email, WhatsApp o SMS. Sin envíos automáticos todavía.
- **`settings`**: fila única con datos del negocio, zona horaria, moneda, IVA y política de reservas.
- **`audit_log`**: acciones administrativas clave con actor, entidad y cambios.

## Reglas críticas

### Anti-overbooking

```sql
exclude using gist (
  barber_id with =,
  tstzrange(starts_at, ends_at, '[)') with &&
) where (status in ('pendiente', 'confirmada', 'en_curso'))
```

También existe una constraint equivalente por `client_id` para evitar que un cliente tenga dos citas activas al mismo tiempo.

### Cálculo de precios

- El precio y la duración se leen de `services` o de `barber_services` en la base de datos.
- `appointment_services` guarda un snapshot; cambiar el servicio después no altera citas pasadas.
- `tax_amount` y `total` se calculan con un trigger según `settings.tax_rate` y `settings.prices_include_tax`.
- CLP se almacena en `numeric(12,0)`, sin decimales.

### Zona horaria

- Fechas en `timestamptz`.
- La zona del negocio vive en `settings.timezone` (`America/Santiago` por defecto).
- La disponibilidad se genera en hora local y se convierte a `timestamptz`.

## Funciones RPC

| Función | Uso |
|---|---|
| `get_available_slots(barber, date, services[], exclude)` | Huecos reales según horario, bloqueos y citas |
| `book_appointment(...)` | Crea cliente si falta, valida y registra la cita |
| `lookup_appointment(code, phone)` | Consulta pública por código y teléfono |
| `cancel_appointment_by_code(code, phone, reason)` | Cancela respetando el plazo configurado |
| `reschedule_appointment_by_code(code, phone, start)` | Reprograma una cita pública |
| `cancel_appointment(id, reason, actor)` | Cancelación por staff |
| `reschedule_appointment(id, start, actor)` | Reprogramación por staff |
| `set_appointment_status(id, status, actor)` | Confirma, inicia o marca no-show |
| `complete_appointment(id, method, amount, tip, actor)` | Cierra la cita y registra el pago |
| `register_sale(items, client, barber, discount, method, notes, actor)` | Venta de servicios y productos |
| `void_sale(sale, reason, actor)` | Anula una venta, repone stock y marca el pago como reembolsado |
| `adjust_stock(product, quantity, type, reason, actor)` | Entrada, salida o ajuste de inventario |
| `dashboard_metrics(from, to)` | Ingresos, citas, ticket promedio y stock bajo |

Todas las RPC de negocio se ejecutan únicamente con `service_role`. La API Express es la que decide qué llamar.

## Triggers

- `updated_at` automático en tablas editables.
- Creación de `profiles` al insertar un usuario en `auth.users`.
- Validación de que un barbero tenga perfil con rol `barbero`.
- Recálculo de totales de citas, ventas y líneas.
- Actualización de stock desde `stock_movements`.
- Actualización de `clients.last_visit_at` al completar una cita.
- Validación de reseñas solo sobre citas completadas.
- Asignación automática de `payments.barber_id` desde la cita o la venta.

## Vistas

- `v_agenda`: cita con cliente, barbero, servicios y totales.
- `v_client_history`: visitas, gasto total y citas activas por cliente.
- `v_low_stock`: productos activos y su estado de stock.
- `v_daily_revenue`: ingresos diarios en la zona del negocio.
- `v_barber_commissions`: comisiones mensuales por barbero.

## RLS y privilegios

- `anon` no tiene privilegios sobre tablas ni vistas.
- `authenticated` solo puede leer. Las políticas limitan:
  - perfil propio;
  - agenda y clientes del barbero;
  - catálogo y configuración para todo el staff;
  - caja y reseñas propias del barbero;
  - notificaciones y auditoría solo para admin.
- Toda escritura pasa por la API con `service_role`.
- `service_role` recibe grants explícitos sobre tablas, secuencias, vistas y funciones.
- Las vistas usan `security_invoker = true` para respetar RLS.
- Las funciones mutadoras tienen `EXECUTE` revocado para `public`, `anon` y `authenticated`.

## Operaciones

Crear el primer administrador:

```bash
cd server
npm run seed:staff -- --email admin@ejemplo.cl --password "TU_CLAVE_SEGURA" --username admin --name "Administrador" --role admin
```

Crear un barbero:

```bash
npm run seed:staff -- --email barbero@ejemplo.cl --password "TU_CLAVE_SEGURA" --username nombre.barbero --name "Nombre Completo" --role barbero --display-name "Nombre Visible"
```

El script asigna horario inicial de lunes a sábado, 10:00 a 19:00, si el barbero no tiene horarios.
