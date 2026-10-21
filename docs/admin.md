# Panel de staff

Panel administrativo y operativo para la barbería. Vive en `frontend/admin/` y se sirve en `http://localhost:5500/admin/`.

Está construido con HTML5, CSS3 y JavaScript vanilla con ES Modules. No usa frameworks, librerías de UI ni librerías de gráficos.

## Acceso

- Solo staff con correo o nombre de usuario y contraseña.
- Roles: `admin` y `barbero`.
- El admin accede a todos los módulos.
- El barbero solo accede a su agenda, sus clientes, sus bloqueos y su perfil.
- El panel usa los endpoints existentes de `/auth`, `/admin` y `/barber`.
- La sesión se restaura con el refresh token y se renueva automáticamente ante un `401`.
- El campo de acceso acepta correo o usuario. El backend resuelve el usuario a su correo de Supabase Auth.
- Los barberos pueden tener un `username` editable desde su ficha. Los administradores se gestionan con el script de staff.
- Cada usuario autenticado puede cambiar su propia contraseña desde **Mi perfil**. Se exige la contraseña actual, la nueva debe tener al menos 8 caracteres y debe ser distinta. La creación de administradores y la recuperación de acceso siguen en manos del desarrollador.

## Módulos

### Admin

| Ruta | Módulo |
|---|---|
| `#/inicio` | Dashboard con métricas, agenda de hoy, comisiones y stock bajo |
| `#/agenda` | Agenda semanal, creación de citas, estados, cancelación, reprogramación y cobro |
| `#/citas` | Bandeja de citas por rango, barbero y estado |
| `#/clientes` | Búsqueda, creación, edición y ficha con historial paginado |
| `#/catalogo` | Categorías y servicios |
| `#/barberos` | Equipo, comisiones, horarios y servicios asignados |
| `#/bloqueos` | Feriados, pausas y ausencias |
| `#/ventas` | Ventas, pagos, comprobantes y anulación |
| `#/inventario` | Productos, stock y movimientos |
| `#/resenas` | Moderación de reseñas |
| `#/configuracion` | Negocio, reservas e impuestos |
| `#/auditoria` | Últimas acciones administrativas |

### Barbero

| Ruta | Módulo |
|---|---|
| `#/mi-agenda` | Agenda propia, estados y cobro |
| `#/mis-clientes` | Clientes atendidos |
| `#/mi-bloqueos` | Bloqueos propios y cierres del local |
| `#/mi-perfil` | Datos de la sesión |

El barbero no puede reprogramar ni anular ventas. Tampoco ve configuración, auditoría, caja global ni ventas de mostrador.

## Tema claro y oscuro

El panel incluye un botón de tema en la barra superior y en el login.

- Guarda la preferencia en `localStorage`.
- Si no hay preferencia, respeta `prefers-color-scheme`.
- Aplica a panel, tablas, formularios, modales, toasts, badges y menú lateral.
- El comprobante imprimible se mantiene en blanco y negro.

## Calendario público y horarios

El sitio público:

- Filtra los barberos según el servicio asignado.
- Usa el horario semanal del barbero seleccionado para habilitar o deshabilitar días.
- No ofrece horas fuera del horario del barbero.
- Marca como no disponibles las horas ocupadas o bloqueadas.
- Si un barbero no tiene un servicio asignado, no aparece como opción para ese servicio.
- Si un servicio se desactiva, desaparece del catálogo público.
- Vuelve a validar en el servidor al confirmar la reserva.

Los cambios del panel se reflejan al recargar la página pública o al consultar disponibilidad nuevamente.

## Comprobantes

El comprobante es un documento interno imprimible, no una boleta electrónica del SII.

Incluye:

- Nombre, razón social, RUT, dirección y teléfono del negocio.
- Código de venta o de cita.
- Fecha y hora.
- Cliente y barbero cuando existen.
- Detalle de ítems.
- Subtotal, descuento, IVA y total.
- Método de pago y propina en citas.
- Marca “ANULADA” con motivo y fecha cuando corresponde.

Se imprime desde el navegador con una hoja de estilos para 80 mm. No usa QR, código de barras ni folio fiscal.

## Anulación de ventas

Solo el admin puede anular una venta pagada.

La operación:

1. Exige un motivo de entre 3 y 500 caracteres.
2. Bloquea la venta para evitar anulaciones simultáneas.
3. Repone el stock de los productos vendidos con un movimiento auditado.
4. Marca los pagos de la venta como `reembolsado`.
5. Cambia la venta a `anulada`.
6. Guarda fecha, usuario y motivo.
7. Registra la acción en auditoría.

La venta y sus líneas no se borran. El comprobante se conserva y se imprime con la marca “ANULADA”.

La anulación cubre ventas de mostrador. La reversión de un pago de cita completada queda fuera de esta versión.

## Historial de cliente

`GET /admin/clients/:id/appointments?limit&offset&from&to` devuelve las visitas paginadas.

La ficha del cliente combina:

- `GET /admin/clients/:id` para los datos personales.
- `GET /admin/clients/:id/history` para visitas completadas, gasto total, citas activas y última cita.
- `GET /admin/clients/:id/appointments` para el listado paginado.

## Migración requerida

El login con usuario utiliza:

```text
supabase/migrations/202610200009_usuarios_staff.sql
```

La anulación de ventas y el reporte de pagos por barbero utilizan la migración `008`. Ambas están aplicadas en el proyecto actual. En una instalación nueva deben ejecutarse todas las migraciones en orden.

La migración agrega:

- `sales.voided_at`
- `sales.voided_by`
- `sales.void_reason`
- `payments.barber_id`
- Trigger para completar `payments.barber_id`
- RPC `void_sale`
- Índices de apoyo

Hasta aplicarla, el panel funciona para las demás vistas, pero la anulación de ventas devolverá error y el filtro de pagos por barbero no estará disponible.

## Puesta en marcha

1. Aplicar las migraciones `001` a `008` en orden.
2. Configurar `server/.env`.
3. Iniciar la API:

```bash
cd server
npm run dev
```

4. Iniciar el servidor estático:

```bash
cd server
npm run frontend
```

5. Abrir `http://localhost:5500/admin/`.

La URL de la API se configura en `frontend/admin/index.html`:

```html
<meta name="api-base" content="http://localhost:4000/api">
```

## Seguridad

- El navegador nunca recibe la `service_role`.
- El access token vive en memoria y el refresh token en `sessionStorage`.
- La API valida roles y propiedad de recursos.
- Los precios, descuentos, IVA, stock y disponibilidad se calculan en el servidor.
- El panel usa escape de HTML en todos los datos dinámicos.
- Las rutas del panel llevan `noindex, nofollow`.
- En producción se debe usar HTTPS y configurar `CORS_ORIGIN`.

## QA realizado

- Login de admin y barbero por correo y por nombre de usuario, validado en vivo.
- Cambio de contraseña propio validado en vivo, incluyendo contraseña actual incorrecta y contraseña nueva.
- Tema claro y oscuro con preferencia persistente.
- Calendario público según el horario del barbero seleccionado.
- Redirección del barbero al intentar abrir rutas de admin.
- Dashboard, agenda, citas, clientes, catálogo, barberos, bloqueos, ventas, pagos, inventario, reseñas, configuración y auditoría sin errores de consola.
- Creación temporal de una cita, confirmación, inicio, cobro y comprobante; datos de prueba eliminados al terminar.
- Ficha de cliente con historial paginado.
- Ficha de barbero con horarios y servicios.
- Modales de nueva cita, cliente, venta, producto y anulación.
- Layout en 320, 390, 768, 1024 y 1440 px sin desbordamiento horizontal.
- axe-core sin violaciones WCAG A/AA en las vistas principales.
- `node --check` sobre los módulos del panel.
- `npm run check` y `npm run db:check` en el servidor.

## Limitaciones

- No hay cierre de caja.
- No hay notificaciones por correo, WhatsApp o SMS.
- No hay exportaciones CSV.
- No hay gestión de otros usuarios administradores ni recuperación de contraseña olvidada desde el panel. Cada usuario puede cambiar su propia contraseña desde **Mi perfil**.
- No hay boleta electrónica del SII.
- No hay anulación de pagos de citas completadas.
- La agenda usa un máximo de 500 citas por rango, definido por la API.
- No hay actualización en tiempo real; las vistas se refrescan al navegar o después de una mutación.
