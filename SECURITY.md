# Política de seguridad

## Reportar una vulnerabilidad

No publiques vulnerabilidades en issues, discusiones ni pull requests públicos.

Usa la pestaña **Security** del repositorio y abre un **Security Advisory** privado. Incluye:

- Versión o commit afectado.
- Descripción del problema.
- Pasos para reproducirlo.
- Impacto estimado.
- Propuesta de corrección, si la tienes.

## Alcance

Este repositorio es un proyecto de portafolio con datos de demostración. No debe usarse como sistema productivo sin una revisión de seguridad adicional, configuración de HTTPS, dominio propio y variables de entorno reales.

## Prácticas aplicadas

- Credenciales fuera del repositorio mediante variables de entorno.
- `service_role` solo en el backend.
- RLS activo y `anon` sin acceso directo a tablas.
- Rate limit en login, reservas, reseñas y consultas públicas.
- Dependencias auditadas con `npm audit` y Dependabot.
- Escaneo de secretos con Gitleaks en local y en CI.
