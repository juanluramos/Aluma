# Autenticación y caducidad por inactividad

## Comportamiento anterior

`src/utils/jwt.ts` emitía un JWT con `expiresIn: "1h"`. La hora empezaba al
firmarlo durante el login local o el login OAuth, independientemente de la
actividad posterior. `authenticate.middleware.ts` verificaba firma, `exp`,
estado y rol actuales del usuario. No existían sesiones persistidas, refresh ni
logout que revocase un JWT.

El frontend guardaba el JWT en `localStorage`. `usuarioService.ts` enviaba
Bearer directamente; `dashboardService.ts` llamaba a rutas públicas. `App.tsx`
no protegía las rutas de navegación. No había un tratamiento común de los 401.

## Comportamiento nuevo

- JWT de acceso: **15 minutos**, HS256, con `sid` que identifica la sesión.
- Credencial de renovación: 32 bytes aleatorios (256 bits), en cookie
  `aluma_refresh`, `HttpOnly`, `SameSite=Lax`, `Path=/api/auth` y `Secure`
  cuando hay HTTPS o `NODE_ENV=production`.
- MariaDB almacena únicamente el SHA-256 de esa credencial, junto con el usuario,
  `lastActivityAt`, `expiresAt` y `revokedAt` en `SesionAutenticacion`.
- El JWT se guarda exclusivamente en memoria en el frontend. Se eliminan los
  antiguos `token` de localStorage/sessionStorage. Solo se comparten marcas de
  actividad y cierre entre pestañas, sin credenciales.
- Cada endpoint protegido comprueba tanto el JWT como la sesión persistida y
  mantiene las comprobaciones existentes del estado y rol del usuario.
- `POST /api/auth/refresh` genera un JWT nuevo. Solo amplía la sesión si comunica
  actividad; una renovación técnica no modifica la fecha de última interacción.
- `POST /api/auth/logout` revoca la sesión y elimina la cookie. Los JWT ya
  emitidos para esa sesión dejan de aceptarse inmediatamente.
- El dashboard pasa a exigir Bearer, igual que el resto de endpoints de negocio.

La credencial opaca tiene una validez deslizante de **60 minutos de inactividad**.
No se rota en cada renovación: es un identificador de sesión validado siempre en
el servidor, no un JWT autónomo de larga duración. Cada login crea una credencial
nueva. No se ha impuesto un límite absoluto a una sesión con actividad continua.
Esto permite la concurrencia entre pestañas sin invalidar unas con otras.

## Cómo se mide la actividad

En una pestaña visible, eventos reales de puntero, teclado, desplazamiento y
pantalla táctil registran actividad. Abrir una ruta protegida también cuenta si
la sesión anterior sigue vigente. Un temporizador comprueba la inactividad y
envía únicamente interacciones pendientes, agrupadas como máximo cada 30 segundos.
Al ocultar o abandonar la pestaña se intenta enviar la última interacción pendiente
mediante fetch keepalive. Se envía la antigüedad del último evento para no confundir la hora del temporizador
con la interacción. El servidor no permite mover una sesión hacia atrás ni
resucitar una sesión caducada.

El deadline es `lastActivityAt + 60 minutos`: con `ahora >= deadline`, el servidor
rechaza acceso y renovación aunque el JWT todavía no haya alcanzado su `exp`.
La cookie vence en el mismo deadline. Los fetch de fondo, el temporizador y los
avisos de Socket.IO no crean actividad.

El cliente limpia memoria y almacenamiento, notifica a las otras pestañas,
solicita logout y desmonta las rutas protegidas mediante redirección a `/login`.
El rechazo de una renovación con 401/403 activa el mismo cierre. Reintentar un
endpoint protegido tras renovar se limita a una vez. Una promesa compartida evita
renovaciones simultáneas dentro de la pestaña; respuestas antiguas no restauran
una sesión cerrada. La API tolera renovaciones concurrentes de otras pestañas.

Si el navegador está suspendido no puede ejecutar una redirección en ese instante:
la API sigue rechazando la sesión desde su deadline y el frontend comprueba la
caducidad al recuperar foco/visibilidad o ejecutar cualquier petición. Si hay un
fallo de red no se puede garantizar que llegue el logout, pero el deadline del
servidor sigue siendo obligatorio y el cliente queda cerrado.

Ejemplo verificado con reloj simulado: login 10:00, actividad 10:30, 11:00 y 11:40;
acceso permitido hasta antes de 12:40 y rechazado exactamente a las 12:40.

## Migración y puesta en marcha

Aplicada `prisma/migrations/202610090001_auth_sessions/migration.sql`, que crea
la tabla `SesionAutenticacion`, sus índices y una FK a `Usuario` con eliminación
en cascada. No modifica datos de usuarios, actividades, inscripciones ni pagos.
Prisma Client y los compilados se han regenerado.

Los JWT anteriores no tienen `sid`: **requieren un nuevo login después del
cambio**. Actualizar backend y frontend conjuntamente; reiniciar los procesos
que no estén en modo watch para cargar los compilados nuevos.

Configuración:

- Backend: `JWT_SECRET` existente y `FRONTEND_URL` (por defecto
  `http://localhost:5173`); en producción `NODE_ENV=production` y HTTPS.
- Frontend: `VITE_API_URL` (por defecto `http://localhost:3000/api`).
- CORS permite credenciales únicamente al origen configurado. Refresh y logout
  requieren `X-Aluma-Session: 1`, que fuerza preflight, y se rechazan orígenes
  no autorizados. El login también comprueba el origen.
- Frontend y API deben desplegarse en el mismo sitio, por ejemplo con proxy
  `/api` o subdominios del mismo dominio. La política Lax no admite un frontend
  alojado en un sitio de terceros.

Los clientes API conservan `Authorization: Bearer <token>`. Para renovar necesitan
la cookie y `X-Aluma-Session: 1`. `X-Aluma-Activity: 1` indica actividad;
`X-Aluma-Activity-Age` es su antigüedad en milisegundos. Omitir actividad o enviar
`0` renueva el JWT sin ampliar la sesión.

## Seguridad y límites

Los checks de sesión en MariaDB hacen efectivos el logout y la caducidad incluso
con un JWT criptográficamente válido. Se mantienen estado y roles consultados en
base de datos. Las respuestas con tokens usan `Cache-Control: no-store`.

HttpOnly evita leer la credencial desde JavaScript, no elimina el riesgo de XSS:
un script ejecutado en el origen autorizado puede realizar peticiones como el
usuario. Una credencial de sesión robada sigue siendo un secreto portador hasta
la revocación o inactividad; este mecanismo no incorpora detección de reutilización
mediante rotación. El servidor no puede demostrar interacción humana frente a un
cliente autenticado malicioso que declare actividad. Estos límites no se resuelven
incrementando `expiresIn`.

Se añade una consulta de sesión a cada petición protegida. Las filas caducadas
no se aceptan aunque permanezcan en la tabla; su purga periódica puede programarse
como mantenimiento. Borrar un usuario elimina sus sesiones mediante la FK.

## Archivos de esta implementación

Backend, nuevos:

- `src/config/session.ts`
- `src/repositories/auth/session.repository.ts`
- `src/services/auth/session.service.ts`
- `src/controllers/auth/session.controller.ts`
- `src/middlewares/auth/session-origin.middleware.ts`
- `prisma/migrations/202610090001_auth_sessions/migration.sql`
- `tests/auth-session.test.ts`
- `docs/autenticacion-sesion-deslizante.md`

Backend, modificados:

- `prisma/schema.prisma`
- `src/utils/jwt.ts`
- `src/middlewares/auth/authenticate.middleware.ts`
- `src/services/auth/service.ts`
- `src/services/auth/oauth.service.ts`
- `src/controllers/auth/controller.ts`
- `src/controllers/auth/oauth.controller.ts`
- `src/routes/auth/routes.ts`
- `src/routes/dashboard/routes.ts`
- `src/app.ts`
- `tests/auth-roles.test.ts`
- `tests/backend-audit.test.ts`
- `tests/solicitud-alta.test.ts`
- `tests/usuario-create-audit.test.ts`
- `tests/usuario-delete-audit.test.ts`
- `tests/usuario-estados.test.ts`
- `tests/usuario-update-audit.test.ts`

Las últimas cuatro pruebas inicializan Socket.IO como lo hace la aplicación;
no se modifica la lógica de negocio de usuarios. El cliente generado bajo
`src/generated/prisma/` y los artefactos de `dist/` se regeneran al compilar.

Frontend (`../Aluma-Frontend`), nuevos:

- `src/services/sessionClient.ts`
- `src/components/auth/ProtectedRoute.tsx`
- `tests/sessionClient.test.ts`

Frontend, modificados:

- `src/services/authService.ts`
- `src/services/usuarioService.ts`
- `src/services/dashboardService.ts`
- `src/pages/LoginPage.tsx`
- `src/components/layout/Header.tsx`
- `src/App.tsx`
- Artefactos de `dist/` generados por Vite.

## Verificación

- `npm run build` en ambos proyectos: correcto.
- `npm test` en backend: **157 pruebas, 157 correctas**.
- Frontend: **10 pruebas del cliente de sesión, 10 correctas**.
- Login y OAuth, duración de JWT, hash del refresh, cookie HttpOnly/Secure,
  acceso válido, JWT expirado, refresh alterado/ausente/expirado, CSRF, logout,
  usuario bloqueado y rechazo protegido con JWT todavía vigente.
- Reloj simulado para el ejemplo completo y el límite exacto de 60 minutos.
- Actividad normal, restauración, peticiones simultáneas, 401 no renovable,
  respuestas tardías tras logout y peticiones de fondo que no alargan la sesión.

Las pruebas de frontend verifican el cliente de sesión y su callback de cierre;
no sustituyen una prueba visual end-to-end del navegador.

Ejecutar las pruebas frontend desde la carpeta del frontend usando el `tsx` ya
instalado en la API:

```sh
node --import ../aluma-api/node_modules/tsx/dist/loader.mjs --test tests/sessionClient.test.ts
```
