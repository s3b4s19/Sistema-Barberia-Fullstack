# Validación funcional en vivo

- Fecha: 2026-10-20T07:09:28.977Z
- API: http://localhost:4000/api
- Resultado: OK
- Comprobaciones: 22 correctas, 0 con error

## Comprobaciones

| Estado | Comprobación | Detalle | ms |
| --- | --- | --- | --- |
| OK | API disponible | HTTP 200, ok | 29 |
| OK | Administrador temporal creado | qa.smoke.<id>@ejemplo.test | 409 |
| OK | Login de administrador | qa.smoke.<id>@ejemplo.test (admin) | 318 |
| OK | Configuración del negocio actualizada | Barbería John / America/Santiago / CLP | 432 |
| OK | Barbero John creado o actualizado | actualizado: barbero.demo@ejemplo.test / <barber-id> | 506 |
| OK | Horario de John configurado | Lunes a sábado, 10:00-14:00 y 15:00-19:00 | 412 |
| OK | Servicios asignados a John | 10 servicios; la cita usará Corte clásico + Perfilado de barba | 839 |
| OK | John visible en el catálogo público | John con 10 servicios | 73 |
| OK | Disponibilidad pública con horarios | 2026-10-27 (26 horarios), 2026-10-28 (26 horarios) | 323 |
| OK | Bloqueo temporal elimina disponibilidad | 2026-10-28T18:00:00+00:00 bloqueado y liberado | 815 |
| OK | Cita de invitado creada | CITA-2F7EFB59 / 2026-10-27T13:00:00+00:00 / 20000 CLP | 92 |
| OK | Consulta por código y teléfono | CITA-2F7EFB59 / pendiente / 2 servicios | 81 |
| OK | Doble reserva rechazada con 409 | El horario seleccionado ya no está disponible | 81 |
| OK | Reprogramación de cita | CITA-2F7EFB59 -> 2026-10-27T14:00:00+00:00 | 77 |
| OK | Cita cancelada libera el horario | CITA-C9DA9108 cancelada y horario liberado | 512 |
| OK | Cita completada con pago y propina | Pago 20000 + propina 1000 | 4230 |
| OK | Reseña creada y moderada | reviewId <review-id> oculta y publicada | 3291 |
| OK | Venta de producto y stock restaurado | venta VENTA-90C54AFE 24000 CLP; stock 10 -> 8 -> 10 | 1683 |
| OK | Dashboard con métricas del período | revenue 64000, completed 2, tips 2000 | 345 |
| OK | Acceso de John como barbero | agenda 4, clientes 2, admin 403 | 1433 |
| OK | anon sin acceso directo a tablas | REST anon HTTP 401; admin sin token HTTP 401 | 87 |
| OK | Auditoría registrada | 8 registros | 219 |

> La comprobación del dashboard se ejecutó antes de eliminar los dos registros de la primera ejecución fallida; por eso muestra 64.000 CLP y 2 citas completadas. El estado final limpio se detalla en la sección siguiente.

## Datos de prueba

- Barbero: John (barbero.demo@ejemplo.test), barberId <barber-id>
- Cliente principal: Cliente de Prueba +56900000002
- Cita: CITA-2F7EFB59, total 20000 CLP
- Reseña: <review-id>
- Venta: VENTA-90C54AFE, total 24000 CLP

## Estado final verificado

- Cita completada: CITA-2F7EFB59, 2026-10-27 14:00 UTC, 20.000 CLP.
- Cita cancelada: CITA-C9DA9108, 2026-10-27 15:00 UTC.
- Pago de cita: 20.000 CLP más 1.000 CLP de propina.
- Venta: VENTA-90C54AFE, 24.000 CLP.
- Reseña publicada: <review-id>.
- Stock de Pomada clásica: 10, restaurado tras la venta.
- Bloqueos temporales: 0.
- Usuarios de Auth: administrador real y John; sin administradores temporales.
- Métricas del período: ingresos 44.000 CLP, 1 completada, 1 cancelada, 1.000 CLP de propinas, 24.000 CLP de productos y 20.000 CLP de servicios.

## Incidencias corregidas

- La primera ejecución detectó que las reseñas nacían publicadas. Se corrigió `review.service.js` para insertar `is_published: false` y se agregó la migración `202610200007_reviews_ocultas_por_defecto.sql`.
- La migración 007 se aplicó al proyecto Supabase real y se verificó en vivo: la especificación de PostgREST reporta `default: false` para `reviews.is_published`.
- Los dos registros de la primera ejecución fallida se eliminaron para dejar solo los datos de la segunda ejecución.
- Se normalizaron los mensajes de error de PostgreSQL con acentos mal codificados en `errorHandler.js`.

## Configuración final verificada

- Registro público de Supabase Auth: deshabilitado (`disable_signup: true`), verificado el 2026-10-20. El proveedor de email permanece activo para el login del staff.
- Migración 007: aplicada. `reviews.is_published` tiene default `false`; la API además fuerza el valor al crear la reseña.
- Sin pendientes de configuración bloqueantes.

## Pendientes antes de producción

- Reemplazar los datos de demostración por datos reales del negocio.
- Eliminar `server/.test-credentials.json`.
- Configurar `CORS_ORIGIN`, dominio real y HTTPS.
- Si habrá varias instancias, mover el rate limit a un almacén compartido.

## Limpieza

- Administrador temporal eliminado.
- Bloqueo temporal eliminado.
- Stock restaurado.
- John, clientes, cita, pago y reseña quedan como datos de demostración.
- Archivo de credenciales de prueba: `server/.test-credentials.json` (no versionado).

## Nota de seguridad

No se incluyen claves ni contraseñas en este informe.
