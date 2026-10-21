# API de la barbería

Base URL local: `http://localhost:4000/api`

Todo se responde en JSON y en camelCase.

## Formato de respuesta

Éxito:

```json
{
  "ok": true,
  "data": {}
}
```

Error:

```json
{
  "ok": false,
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "El horario seleccionado ya no está disponible",
    "details": null
  }
}
```

## Autenticación

Solo el staff inicia sesión. Enviar el token en cada petición privada:

```
Authorization: Bearer <access_token>
```

Roles: `admin` y `barbero`.

---

## Endpoints públicos

### `GET /health`

Verifica que la API esté viva.

### `GET /public/settings`

Datos públicos del negocio: nombre, dirección, teléfono, zona horaria, moneda, horarios de reserva y redes.

### `GET /public/services`

Catálogo activo agrupado por categoría:

```json
{
  "ok": true,
  "data": {
    "categories": [
      {
        "id": "uuid",
        "name": "Cortes",
        "slug": "cortes",
        "services": [
          {
            "id": "uuid",
            "name": "Corte clásico",
            "durationMin": 30,
            "bufferMin": 5,
            "price": 12000
          }
        ]
      }
    ]
  }
}
```

### `GET /public/barbers`

Barberos activos con los servicios que ofrecen y su horario semanal. El sitio usa `services` para filtrar barberos elegibles y `schedules` para cerrar los días en que el barbero seleccionado no trabaja.

### `GET /public/hours`

Horario público agregado de todos los barberos activos. No requiere autenticación y se usa para el horario general del local. Para el calendario de reserva, el frontend usa el horario del barbero seleccionado incluido en `/public/barbers`.

```json
{
  "ok": true,
  "data": {
    "timeZone": "America/Santiago",
    "maxAdvanceDays": 60,
    "minAdvanceMin": 60,
    "slotIntervalMin": 15,
    "days": [
      {
        "weekday": 0,
        "label": "Domingo",
        "isOpen": false,
        "shifts": []
      },
      {
        "weekday": 1,
        "label": "Lunes",
        "isOpen": true,
        "shifts": [
          { "start": "10:00", "end": "14:00" },
          { "start": "15:00", "end": "19:00" }
        ]
      }
    ]
  }
}
```

`weekday` usa la convención de PostgreSQL: `0` domingo, `6` sábado. Los turnos de varios barberos se fusionan por día para no repetir rangos equivalentes.

### `GET /public/availability/day`

Disponibilidad de un día completa, pensada para el calendario público. A diferencia de `/availability`, devuelve también los horarios no disponibles para que la interfaz pueda mostrarlos como ocupados.

Parámetros:

- `date` (obligatorio): `YYYY-MM-DD`, entre hoy y `maxAdvanceDays`.
- `serviceId` (obligatorio): UUID de un servicio activo.
- `barberId` (opcional): UUID de un barbero o `any`. Si el servicio lo realiza un solo barbero activo, se puede omitir o enviar `any`. Si son varios, hay que elegir uno; de lo contrario responde `400 BARBER_REQUIRED`.

Ejemplo:

`GET /public/availability/day?date=2026-10-27&serviceId=UUID&barberId=UUID`

```json
{
  "ok": true,
  "data": {
    "date": "2026-10-27",
    "timeZone": "America/Santiago",
    "isOpen": true,
    "barber": { "id": "uuid", "displayName": "John" },
    "service": {
      "id": "uuid",
      "name": "Corte clásico",
      "durationMin": 30,
      "bufferMin": 5,
      "price": 12000
    },
    "slots": [
      {
        "time": "10:00",
        "startsAt": "2026-10-27T13:00:00+00:00",
        "endsAt": "2026-10-27T13:35:00+00:00",
        "available": true
      },
      {
        "time": "10:15",
        "startsAt": null,
        "endsAt": null,
        "available": false
      }
    ]
  }
}
```

La grilla se construye desde `barber_schedules` con `slotIntervalMin`. La columna `available` refleja las citas, bloqueos, descansos y buffers ya descontados por `get_available_slots`. Si el día no tiene turnos, `isOpen` es `false` y `slots` queda vacío. La cuenta se limita a 90 solicitudes por minuto y por IP.

### `GET /availability?barberId=UUID&date=YYYY-MM-DD&serviceIds=UUID,UUID`

Lista plana de horarios realmente disponibles. El sitio público usa `/public/availability/day` para poder dibujar también los horarios ocupados.

Devuelve horarios reales, ya descontando citas, bloqueos, descansos y tiempo de limpieza.

```json
{
  "ok": true,
  "data": {
    "date": "2026-10-27",
    "timeZone": "America/Santiago",
    "slots": [
      {
        "startsAt": "2026-10-27T13:00:00+00:00",
        "endsAt": "2026-10-27T13:40:00+00:00"
      }
    ]
  }
}
```

### `POST /appointments`

Reserva como invitado. La API normaliza el teléfono, valida y calcula el precio en la base de datos.

```json
{
  "barberId": "uuid",
  "serviceIds": ["uuid", "uuid"],
  "startsAt": "2026-10-27T13:00:00.000Z",
  "fullName": "Nombre Cliente",
  "phone": "+56912345678",
  "email": "cliente@correo.cl",
  "notes": "Sin observaciones",
  "company": ""
}
```

`company` es un honeypot: debe ir vacío.

Respuesta `201`:

```json
{
  "ok": true,
  "data": {
    "id": "uuid",
    "code": "CITA-AB12CD34",
    "status": "pendiente",
    "startsAt": "2026-10-27T13:00:00+00:00",
    "endsAt": "2026-10-27T13:40:00+00:00",
    "subtotal": 25000,
    "discount": 0,
    "taxAmount": 3992,
    "total": 25000
  }
}
```

### `GET /appointments/:code?phone=+56912345678`

Consulta la cita con código y teléfono. Devuelve cliente, barbero, servicios, totales y horas de cancelación.

### `POST /appointments/:code/cancel`

```json
{
  "phone": "+56912345678",
  "reason": "No podré asistir"
}
```

Respeta `settings.cancellation_hours`. Fuera de plazo responde `409 CANCELLATION_WINDOW`.

### `POST /appointments/:code/reschedule`

```json
{
  "phone": "+56912345678",
  "startsAt": "2026-10-28T15:00:00.000Z"
}
```

### `GET /public/reviews?barberId=UUID&limit=20`

Reseñas publicadas. No expone datos del cliente.

### `POST /reviews`

Solo para citas completadas. Una reseña por cita. La reseña nace oculta (`isPublished: false`) y el administrador decide cuándo publicarla.

```json
{
  "code": "CITA-AB12CD34",
  "phone": "+56912345678",
  "rating": 5,
  "comment": "Excelente atención"
}
```

---

## Autenticación del staff

### `POST /auth/login`

```json
{
  "identifier": "admin@ejemplo.cl",
  "password": "TU_CLAVE_SEGURA"
}
```

`identifier` acepta el correo o el nombre de usuario del staff. También se mantiene `email` por compatibilidad.

Respuesta:

```json
{
  "ok": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "v1...",
    "expiresIn": 3600,
    "user": {
      "id": "uuid",
      "email": "admin@ejemplo.cl",
      "username": "admin",
      "role": "admin",
      "fullName": "Administrador",
      "barberId": null
    }
  }
}
```

### `POST /auth/refresh`

```json
{ "refreshToken": "v1..." }
```

### `POST /auth/logout`

Requiere `Authorization`.

### `GET /auth/me`

Requiere `Authorization`. Devuelve el perfil del staff autenticado.

### `POST /auth/change-password`

Requiere `Authorization`.

```json
{
  "currentPassword": "TU_CLAVE_ACTUAL",
  "newPassword": "TU_CLAVE_NUEVA"
}
```

Verifica la contraseña actual y actualiza la contraseña de la cuenta autenticada. La nueva contraseña debe tener entre 8 y 128 caracteres y ser distinta a la actual.

---

## Endpoints de administración

Todos requieren rol `admin`.

### Agenda y citas

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/appointments?from&to&barberId&status` | Agenda por rango |
| `POST` | `/admin/appointments` | Cita de mostrador o teléfono |
| `GET` | `/admin/appointments/:id` | Detalle de cita |
| `PATCH` | `/admin/appointments/:id/status` | `confirmada`, `en_curso`, `no_asistio` |
| `POST` | `/admin/appointments/:id/cancel` | Cancelar |
| `POST` | `/admin/appointments/:id/reschedule` | Reprogramar |
| `POST` | `/admin/appointments/:id/complete` | Completar y cobrar |

Cita de mostrador:

```json
{
  "barberId": "uuid",
  "serviceIds": ["uuid"],
  "startsAt": "2026-10-20T18:00:00.000Z",
  "fullName": "Cliente Mostrador",
  "phone": "+56912345678",
  "source": "mostrador"
}
```

Completar cita:

```json
{
  "method": "efectivo",
  "amount": 12000,
  "tip": 1000
}
```

`amount` es opcional; si se omite, se usa el total de la cita.

### Clientes

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/clients?search&limit&offset` | Buscar por nombre, teléfono o correo |
| `POST` | `/admin/clients` | Crear cliente |
| `GET` | `/admin/clients/:id` | Detalle |
| `PATCH` | `/admin/clients/:id` | Editar |
| `GET` | `/admin/clients/:id/history` | Historial agregado |
| `GET` | `/admin/clients/:id/appointments?limit&offset&from&to` | Visitas paginadas |

### Catálogo

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/services` | Todos los servicios |
| `POST` | `/admin/services` | Crear |
| `PATCH` | `/admin/services/:id` | Editar |
| `DELETE` | `/admin/services/:id` | Desactivar |
| `GET` | `/admin/categories` | Categorías |
| `POST` | `/admin/categories` | Crear |
| `PATCH` | `/admin/categories/:id` | Editar |

Servicio:

```json
{
  "categoryId": "uuid",
  "name": "Corte fade",
  "slug": "corte-fade",
  "description": "Degradado progresivo",
  "durationMin": 35,
  "bufferMin": 5,
  "price": 14000,
  "sortOrder": 2
}
```

### Barberos y horarios

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/barbers` | Listado con perfil |
| `POST` | `/admin/barbers` | Crea usuario de auth + perfil + ficha |
| `PATCH` | `/admin/barbers/:id` | Editar ficha |
| `GET` | `/admin/barbers/:barberId/schedules` | Horario semanal |
| `PUT` | `/admin/barbers/:barberId/schedules` | Reemplazar horario |
| `GET` | `/admin/barbers/:barberId/services` | Servicios asignados |
| `PUT` | `/admin/barbers/:barberId/services` | Reemplazar servicios asignados |

Crear barbero:

```json
{
  "email": "barbero@ejemplo.cl",
  "password": "TU_CLAVE_SEGURA",
  "username": "nombre.barbero",
  "fullName": "Nombre Completo",
  "displayName": "Nombre Público",
  "phone": "+56912345678",
  "commissionRate": 40,
  "accentColor": "#3f4a5a"
}
```

Reemplazar horario:

```json
{
  "schedules": [
    { "weekday": 1, "startTime": "10:00", "endTime": "14:00" },
    { "weekday": 1, "startTime": "15:00", "endTime": "19:00" },
    { "weekday": 2, "startTime": "10:00", "endTime": "19:00" }
  ]
}
```

Asignar servicios a un barbero:

```json
{
  "services": [
    { "serviceId": "uuid", "priceOverride": null, "durationOverride": null },
    { "serviceId": "uuid", "priceOverride": 15000, "durationOverride": 40 }
  ]
}
```

`username` es opcional al crear. Si se omite, se deriva del correo y se agrega un sufijo si ya está ocupado. Para desactivar un barbero (`isActive: false`) primero hay que reasignar o cancelar sus citas activas. La desactivación también desactiva su perfil de acceso.

### Bloqueos

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/time-off?from&to` | Bloqueos |
| `POST` | `/admin/time-off` | Crear bloqueo |
| `DELETE` | `/admin/time-off/:id` | Eliminar |

```json
{
  "barberId": "uuid o null",
  "startsAt": "2026-12-24T00:00:00.000Z",
  "endsAt": "2026-12-25T00:00:00.000Z",
  "reason": "Feriado"
}
```

`barberId: null` cierra todo el local.

### Caja e inventario

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/products?search&lowStock` | Productos |
| `POST` | `/admin/products` | Crear |
| `PATCH` | `/admin/products/:id` | Editar |
| `POST` | `/admin/products/:id/stock` | Entrada, salida o ajuste |
| `GET` | `/admin/products/:id/movements` | Historial de stock |
| `GET` | `/admin/sales?from&to&barberId&status` | Ventas |
| `POST` | `/admin/sales` | Registrar venta |
| `GET` | `/admin/sales/:id` | Detalle con pagos |
| `POST` | `/admin/sales/:id/void` | Anular venta pagada |
| `GET` | `/admin/payments?from&to&barberId&status&limit` | Pagos |
| `GET` | `/admin/payment-methods` | Métodos disponibles |

`PATCH /admin/products/:id` no modifica el stock. Todo cambio de existencias debe pasar por `POST /admin/products/:id/stock`, que deja movimiento auditado.

`GET /admin/sales/:id` y `GET /admin/appointments/:id` incluyen el arreglo `payments` para construir el comprobante interno. `GET /barber/appointments/:id` hace lo mismo para las citas del barbero autenticado.

Movimiento de stock:

```json
{
  "type": "entrada",
  "quantity": 12,
  "reason": "Compra a proveedor"
}
```

Venta:

```json
{
  "items": [
    { "type": "servicio", "id": "uuid", "quantity": 1 },
    { "type": "producto", "id": "uuid", "quantity": 2 }
  ],
  "clientId": "uuid o null",
  "barberId": "uuid o null",
  "discount": 0,
  "method": "efectivo",
  "notes": "Venta de mostrador"
}
```

Anular una venta pagada:

```json
{
  "reason": "Producto defectuoso"
}
```

La venta cambia a `anulada`, el pago a `reembolsado` y los productos vuelven al stock con un movimiento auditado. La operación se rechaza si la venta ya fue anulada.

### Métricas

`GET /admin/dashboard?from&to`

Devuelve:

- citas totales, completadas, canceladas y no-show;
- ingresos, propinas, ingresos por servicios y productos;
- ticket promedio y clientes nuevos;
- stock bajo;
- ingresos diarios;
- comisiones por barbero.

### Configuración, reseñas y auditoría

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/admin/settings` | Configuración completa |
| `PATCH` | `/admin/settings` | Actualizar negocio, IVA, horarios y reservas |
| `GET` | `/admin/reviews?limit` | Todas las reseñas |
| `PATCH` | `/admin/reviews/:id` | Publicar u ocultar (`isPublished`) |
| `GET` | `/admin/audit?limit` | Últimas acciones administrativas |

Configuración:

```json
{
  "businessName": "Barbería",
  "phone": "+56912345678",
  "address": "Av. Ejemplo 123",
  "city": "Santiago",
  "timezone": "America/Santiago",
  "slotIntervalMin": 15,
  "minAdvanceMin": 60,
  "maxAdvanceDays": 60,
  "cancellationHours": 12,
  "taxRate": 19,
  "pricesIncludeTax": true
}
```

---

## Endpoints del barbero

Requieren rol `barbero` o `admin`. El barbero solo opera sobre su propia agenda; el admin debe enviar `barberId` en la query.

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/barber/agenda?from&to` | Agenda propia |
| `GET` | `/barber/clients` | Clientes atendidos |
| `GET` | `/barber/appointments/:id` | Detalle de una cita propia con pagos |
| `POST` | `/barber/appointments` | Crear cita propia |
| `PATCH` | `/barber/appointments/:id/status` | Confirmar o iniciar |
| `POST` | `/barber/appointments/:id/cancel` | Cancelar |
| `POST` | `/barber/appointments/:id/complete` | Completar y cobrar |
| `GET` | `/barber/time-off` | Bloqueos propios |
| `POST` | `/barber/time-off` | Crear bloqueo |
| `DELETE` | `/barber/time-off/:id` | Eliminar bloqueo propio |

---

## Códigos de error

| Código | HTTP | Significado |
|---|---|---|
| `INVALID_INPUT` | 400 | Dato faltante o formato inválido |
| `INVALID_USERNAME` | 400 | Nombre de usuario con formato inválido |
| `USERNAME_TAKEN` | 409 | El nombre de usuario ya está en uso |
| `INVALID_PHONE` | 400 | Teléfono no normalizable |
| `UNAUTHORIZED` | 401 | Falta token o sesión expirada |
| `INVALID_CREDENTIALS` | 401 | Login incorrecto |
| `INVALID_CURRENT_PASSWORD` | 400 | La contraseña actual no es correcta |
| `SAME_PASSWORD` | 400 | La nueva contraseña es igual a la actual |
| `WEAK_PASSWORD` | 400 | La nueva contraseña es demasiado débil |
| `PASSWORD_UPDATE_FAILED` | 400 | No se pudo actualizar la contraseña |
| `FORBIDDEN` | 403 | Rol o recurso no permitido |
| `APPOINTMENT_NOT_FOUND` | 404 | Cita no encontrada |
| `SLOT_UNAVAILABLE` | 409 | Horario ocupado o bloqueado |
| `ACTIVE_APPOINTMENT_LIMIT` | 409 | Máximo de citas activas por cliente |
| `CANCELLATION_WINDOW` | 409 | Fuera del plazo de cambio |
| `APPOINTMENT_CLOSED` | 409 | Cita ya cerrada |
| `PAYMENT_ALREADY_EXISTS` | 409 | Pago duplicado |
| `INSUFFICIENT_STOCK` | 409 | Stock insuficiente |
| `SALE_NOT_FOUND` | 404 | Venta no encontrada |
| `SALE_ALREADY_VOIDED` | 409 | La venta ya fue anulada |
| `SALE_NOT_PAID` | 409 | Solo se pueden anular ventas pagadas |
| `REVIEW_NOT_ALLOWED` | 409 | La cita no está completada |
| `REVIEW_EXISTS` | 409 | La cita ya tiene reseña |
| `REVIEW_NOT_FOUND` | 404 | Reseña no encontrada |
| `INVALID_SERVICES` | 400 | Servicio inexistente o inactivo |
| `BARBER_HAS_APPOINTMENTS` | 409 | No se puede desactivar un barbero con citas activas |
| `USE_STOCK_ENDPOINT` | 400 | El stock solo se cambia con el endpoint de ajuste |
| `DUPLICATE` | 409 | Valor único repetido |
| `TOO_MANY_REQUESTS` | 429 | Rate limit |
| `INTERNAL_ERROR` | 500 | Error no controlado |

## Límites de peticiones

| Ámbito | Límite |
|---|---|
| Global por IP | 120 por minuto |
| Crear cita | 10 cada 15 minutos |
| Consultar cita | 30 por minuto |
| Login | 10 cada 15 minutos |
| Cancelar o reprogramar | 15 cada 15 minutos |
| Crear reseña | 5 por hora |

Los límites se configuran con `API_RATE_LIMIT_MAX` para el global.
