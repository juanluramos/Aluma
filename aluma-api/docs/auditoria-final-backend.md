# Auditoría final del backend ALUMA

## Rutas y permisos

- Públicas: `GET /`, `POST /api/auth/login`, inicio y callback de Google. El callback exige `state` firmado, vigente y coincidente con una cookie HttpOnly/SameSite=Lax del navegador que inició el flujo.
- SolicitudAlta: crear y consultar la solicitud propia exige un token de registro Google; listar, consultar por ID y resolver exige JWT de Administrador.
- Usuarios: listado y creación para Operador/Administrador; detalle y edición sujetos a propiedad/campos permitidos; eliminación para Administrador.
- Actividades: lectura autenticada; creación/edición para Operador/Administrador; eliminación para Administrador.
- Inscripciones: consulta propia para Usuario, consulta completa para personal; alta sujeta a propiedad; edición para personal y eliminación para Administrador.
- Movimientos: Operador/Administrador; eliminación para Administrador. Los movimientos de inscripciones siguen protegidos contra escritura directa.
- Cada petición autenticada consulta el estado y rol actuales del usuario. No se cambió la matriz de permisos ni el esquema.

## Correcciones de esta revisión

- IDs de rutas y referencias en DTOs: enteros positivos dentro del rango de INT, evitando errores de Prisma por decimales/desbordamientos.
- Zod: email válido al crear usuarios; importes de actividades y movimientos dentro de DECIMAL(10,2); fechas obligatorias de movimientos no aceptan null/booleanos.
- Edición de usuario sin body: validación 400 en lugar de excepción en autorización de campos.
- JSON malformado: 400; tamaño excesivo: 413. Errores inesperados conservan 500 y código estable.
- Logs HTTP sin query string (incluidos códigos Google); errores inesperados registran solo código y requestId, sin objetos de error, SQL ni datos de entrada.
- Google OAuth: comprobación de state antes de intercambiar el código.
- SolicitudAlta: el controller consulta a través del servicio. Ningún controller accede directamente a Prisma.

## Código y capas

Los controllers procesan HTTP/validación; los servicios aplican negocio y coordinan transacciones; los repositories realizan persistencia. Los accesos Prisma de servicios se mantienen para coordinar transacciones y comprobaciones. No hay rutas duplicadas de creación de usuarios.

Quedan helpers internos sin consumidores (`updateEnrollmentWithMovement`, `getRefundByEnrollmentId`, `getChargeByEnrollmentId`, `UpdateUserData`). No están expuestos como endpoints; se conservaron para limitar la auditoría a correcciones funcionales, sin limpieza general.

## Verificación y alcance

La suite comprueba protección de rutas, validación, logs, roles/estados vigentes, separación Local/OAuth, SolicitudAlta concurrente y atómica, cobros/devoluciones y auditorías con rollback. Usa fixtures de integración y las limpia al terminar.

Google se prueba con su intercambio/verificación simulados; no se hizo un login real contra Google. Para integrar el frontend, iniciar OAuth mediante navegación a `/api/auth/google/login`, mantener el mismo host hasta el callback y configurar la URL de callback registrada en Google. Las llamadas al backend pueden usar el mismo origen mediante proxy; esta auditoría no incorpora configuración CORS nueva.

Resultado final: `npm run build` correcto; `npm test`: 145 pruebas aprobadas, 0 fallos, 0 omitidas. Backend listo para integración con frontend dentro del alcance verificado.
