# Frontend público

Sitio de reservas para una sola barbería. Está construido con HTML5, CSS3 y JavaScript vanilla (ES Modules), sin frameworks ni dependencias de frontend.

## Alcance actual

Incluye:

- Portada con fotografía Unsplash, nombre del negocio, horario, dirección y llamada a la acción.
- Catálogo de servicios con duración y precio final.
- Reserva de invitados en tres pasos: servicio, fecha/hora y datos.
- Calendario con días cerrados, fechas fuera de rango y horarios disponibles/ocupados.
- Confirmación con código de reserva, detalle y opción de copiar el código.
- Consulta y cancelación de una cita con el código de reserva y el teléfono usado al reservar.
- Galería de trabajos con carrusel en móvil y grilla en escritorio.
- Reseñas publicadas; si no hay reseñas, el bloque se oculta y la galería ocupa el ancho completo.
- Pie de página con contacto, horario, enlaces y crédito de Unsplash.

No incluye reprogramación desde el navegador. La consulta y la cancelación usan los endpoints públicos existentes; no se envían correos ni mensajes automáticos. El panel de staff es una aplicación separada en `frontend/admin/` y se documenta en `docs/admin.md`.

## Puesta en marcha

La API debe estar disponible en `http://localhost:4000/api`.

```bash
cd server
npm run dev
```

En otra terminal:

```bash
cd server
npm run frontend
```

Abrir `http://localhost:5500`.

El servidor de frontend es un servidor estático mínimo sin dependencias (`server/scripts/serve-frontend.mjs`). Se usa un puerto separado para que el CSP de Helmet en la API no bloquee las imágenes de Unsplash. El script se puede cambiar con `FRONTEND_PORT`.

La URL de la API se configura en `frontend/index.html`:

```html
<meta name="api-base" content="http://localhost:4000/api">
```

Para desplegar en otro dominio hay que actualizar ese valor y `CORS_ORIGIN` en `server/.env`.

## Estructura

```text
frontend/
├── index.html
├── favicon.svg
└── assets/
    ├── css/styles.css
    └── js/
        ├── api.js       Cliente HTTP y endpoints públicos
        ├── format.js    Precios, fechas, teléfonos y utilidades
        ├── catalog.js   Render del catálogo de servicios
        ├── booking.js   Asistente de reserva, calendario y confirmación
        ├── appointment.js Consulta y cancelación por código y teléfono
        ├── gallery.js   Reseñas y carrusel móvil
        └── main.js      Arranque, datos del negocio y horarios
```

`main.js` carga en paralelo `settings`, `services`, `barbers`, `hours` y `reviews` con `Promise.allSettled`. Cada bloque se renderiza de forma independiente para que un fallo parcial no rompa toda la página. El catálogo y los horarios muestran estados de error con opción de reintentar.

## Datos y reglas de negocio

El navegador nunca calcula precios, descuentos, stock ni disponibilidad. Solo presenta lo que responde la API.

Endpoints usados:

- `GET /api/public/settings`: nombre, dirección, teléfono, correo, redes y zona horaria.
- `GET /api/public/services`: catálogo agrupado por categoría.
- `GET /api/public/barbers`: barberos activos, servicios que realizan y horario semanal.
- `GET /api/public/hours`: horario semanal agregado del local.
- `GET /api/public/reviews`: reseñas publicadas.
- `GET /api/public/availability/day`: grilla de un día para un servicio y barbero.
- `POST /api/appointments`: creación de la reserva como invitado.
- `GET /api/appointments/:code?phone=+56...`: consulta de una cita por código y teléfono.
- `POST /api/appointments/:code/cancel`: cancelación por código y teléfono, con motivo opcional.

Decisiones del flujo:

- Una reserva incluye un solo servicio.
- Si el servicio lo realiza un único barbero activo, se asigna automáticamente.
- Si hay varios barberos elegibles, el usuario debe elegir uno. La opción "cualquiera" para varios barberos queda como mejora futura.
- Los barberos se filtran por servicio asignado. Un barbero sin el servicio no aparece como opción.
- El calendario usa el horario semanal del barbero seleccionado; los días sin turno para ese barbero se deshabilitan.
- Las fechas se limitan a hoy más `maxAdvanceDays`.
- El calendario se calcula en la zona horaria del negocio (`America/Santiago`), no en la del dispositivo.
- Los horarios ocupados se muestran con borde punteado y no se pueden seleccionar.
- El teléfono se normaliza a `+56` y se valida como celular chileno de nueve dígitos.
- El correo es obligatorio para la confirmación, pero no se envía ningún correo: la confirmación queda solo en pantalla.
- Al confirmar, la API vuelve a validar el horario y el precio. Un choque de disponibilidad devuelve al paso de horario.
- La consulta usa código y teléfono; un error de coincidencia muestra un mensaje genérico para no revelar si el código existe.
- La cancelación se confirma en dos pasos con motivo opcional. El frontend muestra el plazo usando `cancellationHours`, pero la API decide si la cancelación es válida. Después de cancelar se ofrece reservar una nueva hora.
- No hay reprogramación en la interfaz: para cambiar una cita se cancela y se reserva de nuevo. La reprogramación requeriría exponer los identificadores de servicio y reutilizar la disponibilidad.
- El código de una reserva recién confirmada se precarga en el formulario de consulta para facilitar el acceso desde la pantalla de éxito.

## Diseño

Paleta sobria definida en `:root`:

- Carbón `#17150f`, carbón suave `#2d2921` y crema oscuro `#2f2a22` para el panel de horario.
- Marfil `#f2ede2`, papel `#fbf8f1` y superficie `#fffdf8`.
- Latón `#8a6a3b`, texto latón `#7a5b2f` y latón claro `#c9ad7c` solo sobre fondos oscuros.
- Línea `#d9d0bd`, texto atenuado `#5f594d`, error `#8c2f2f`.

Tipografía del sistema (`ui-sans-serif`, `system-ui`, Segoe UI, Roboto, etc.). No se cargan fuentes externas.

El CSS usa metodología BEM, custom properties para colores, tipografía, espaciados, radios y transiciones, y estrategia mobile-first. Los scripts se cargan como módulos al final del documento. Los iconos son SVG inline, sin emojis ni imágenes decorativas externas.

Breakpoints:

- Móvil: menos de `48em` (768 px).
- Tablet: `48em` a `64em` (1024 px).
- Escritorio: desde `64em`.
- Consulta y cancelación: una columna hasta `75em`; desde ahí, el formulario y el resultado se muestran en dos columnas cuando hay una reserva cargada.

Ajustes de escritorio:

- El panel de horario del hero usa fondo crema oscuro, borde de latón y mayor ancho y padding. El horario se ordena siempre de lunes a domingo, con el día actual resaltado y marcado con `aria-current="date"`.
- El calendario del paso 2 se centra dentro del `.wizard__panel` con márgenes automáticos, sin alterar los bloques de horarios disponibles.
- En el pie, los enlaces de “Reservas” se apilan verticalmente y el espaciado general se reduce para que el bloque sea más compacto.
- En escritorio, Contacto, Horario y Reservas usan columnas del ancho de su contenido, con una separación de 16–24 px.
- En Contacto, las líneas quedan a 2.4 px de distancia. En móvil los enlaces mantienen 44 px de altura táctil; en escritorio se reducen a 32 px.

## Accesibilidad

- HTML semántico con un solo `h1`, jerarquía de encabezados y regiones etiquetadas.
- Enlace para saltar al contenido.
- Etiquetas asociadas a todos los campos, errores con `aria-describedby`, resumen de error con `role="alert"` y foco en el primer campo inválido.
- Estados de carga y disponibilidad con `aria-live`.
- Paso actual del asistente con `aria-current="step"`.
- Consulta y cancelación con errores asociados a los campos, mensaje de error con `role="alert"`, foco en el primer campo inválido, título del resultado enfocado y confirmación de cancelación anunciada con `role="status"`.
- Calendario navegable con flechas, Inicio y Fin.
- Radios de servicio con navegación nativa por flechas.
- Contraste WCAG AA; foco visible adaptado a fondos claros y oscuros.
- Objetivos táctiles de 44 px como mínimo. En pantallas de 320 px el calendario de siete columnas no puede mantener 44 px de ancho; en 390 px y superiores sí.
- `prefers-reduced-motion` desactiva transiciones y desplazamientos suaves.

## Imágenes

Todas las fotografías se cargan desde Unsplash mediante URLs optimizadas (`auto=format`, `fit=crop`, ancho y alto). El pie de página incluye el crédito a Unsplash. El hero tiene una imagen móvil vertical y una de escritorio horizontal. La galería usa `srcset` y `sizes`, con carga diferida.

## QA realizado

- Flujo completo de reserva en vivo con un servicio, fecha, horario, datos y confirmación.
- Consulta en vivo por código y teléfono con una cita temporal; código inexistente devuelve el mensaje genérico.
- Cancelación en dos pasos con motivo, estado "Cancelada", ocultamiento del botón de cancelar, feedback visible y enlace para reservar otra hora.
- Precarga del código en el formulario de consulta desde la pantalla de éxito y reinicio del asistente al elegir "Reservar nueva hora".
- Limpieza inmediata de las citas y clientes de prueba; los datos de demostración quedaron intactos.
- Validación de formulario vacío y de formato de teléfono/correo.
- Selección de servicio desde el catálogo y desde el asistente.
- Navegación entre pasos, reinicio con "Hacer otra reserva" y limpieza del formulario.
- Revisión visual en 320×640, 390×844, 768×1024, 1024×768 y 1440×900.
- Refinamiento de escritorio verificado: panel de horario crema oscuro, orden lunes–domingo, calendario del paso 2 centrado y enlaces del pie apilados.
- Footer compacto verificado en 320–1440: columnas agrupadas, líneas de contacto a 2.4 px y objetivos táctiles de 44 px en móvil.
- Sin desbordamiento horizontal en 320, 390, 768, 1024 y 1440; corregido el desbordamiento de la lista de servicios en 320.
- Consola del navegador sin errores ni advertencias en el flujo probado.
- axe-core sin violaciones WCAG A/AA; una comprobación de contraste quedó pendiente de revisión manual por el fondo fotográfico del hero, con contraste verificado en el panel oscuro.
- Imágenes de Unsplash verificadas visualmente; carga correcta del hero y de la galería.

## Limitaciones y siguientes pasos

- El sitio público es solo para clientes; el panel de staff está separado en `/admin/` y se documenta en `docs/admin.md`.
- La reprogramación no tiene interfaz: se cancela la cita y se reserva una nueva.
- La selección "cualquiera" con varios barberos requiere agregar disponibilidad agregada en la API.
- Los cambios de horarios y servicios se reflejan al recargar la página o al volver a consultar disponibilidad; no hay actualización en tiempo real.
- No hay envío de correos ni WhatsApp; la confirmación y la cancelación quedan solo en pantalla.
- El servidor estático y la URL de API están pensados para desarrollo local.
