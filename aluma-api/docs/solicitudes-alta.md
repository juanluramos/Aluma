# Solicitudes de alta OAuth

Google conserva el intercambio getToken → verifyIdToken. Se exige sub, email y email_verified antes de resolver la identidad. Cuenta existente: login y comprobación permiteLogin. Usuario existente por email: linked, como antes. Identidad nueva: registration_required y registrationToken, sin crear Usuario.

## Credencial de formulario

registrationToken dura 15 minutos, tiene audiencia solicitud-alta y clave derivada distinta del JWT de acceso. Usar Authorization: Bearer <registrationToken> solo en presentación y consulta propia. No enviarlo en URL. Al caducar, repetir Google. No es una sesión de ALUMA. Google devuelve registration_pending o registration_rejected si ya hay solicitud, junto con una credencial nueva para consultar el estado.

## API

- POST /api/solicitudes-alta: credencial de formulario. Body: id_tipo_documento, numeroDocumento, nombre, socio; opcionales apellido1, apellido2, telefono. Devuelve 201 y solicitud Pendiente. Se rechazan campos adicionales (email, proveedor, external_id, rol, matrícula...). Identidad siempre obtenida del token verificado.
- GET /api/solicitudes-alta/mi-solicitud: misma credencial; estado y resolución propios.
- GET /api/solicitudes-alta?page=1&limit=25: JWT Administrador, listado paginado (máximo 100).
- GET /api/solicitudes-alta/:id: JWT Administrador, detalle.
- POST /api/solicitudes-alta/:id/resolucion: JWT Administrador. Body {"decision":"Aceptar"} o {"decision":"Rechazar","motivo":"..."}. El motivo no vacío es obligatorio, máximo 500 caracteres.

Una solicitud por proveedor/external_id; rechazadas no se reabren automáticamente. Pendiente no concede acceso. Aprobada crea Usuario con rol 1 (Usuario), estado 1 (Activo), matriculaPagada=false y socio solicitado. La siguiente autenticación Google devuelve JWT; la resolución administrativa no devuelve JWT del solicitante.

## Atomicidad y conflictos

El service bloquea la fila de solicitud (FOR UPDATE) en la transacción de resolución. Crea usuario, cuenta OAuth y marca Aceptada en la misma transacción. Rechazo solo modifica solicitud. Fallos revierten toda la operación. Resolución repetida devuelve 409 APPLICATION_ALREADY_RESOLVED. Conflicto de email/documento/identidad devuelve 409 y deja Pendiente. Se vuelve a verificar en BD que quien resuelve sea administrador habilitado.

Las FK históricas usan RESTRICT, sin cascadas: una solicitud resuelta puede impedir eliminar el usuario creado o el administrador de resolución. La identidad externa tiene UNIQUE compuesto tanto en CuentaAutenticacion como en SolicitudAlta.

## Migración

202610050001_baseline describe el esquema preexistente. En la instalación actual se verificó diff vacío y se marcó aplicada, sin ejecutar sus CREATE TABLE. 202610050002_solicitud_alta crea tablas, relaciones, unicidad OAuth y los tres estados. En nuevas instalaciones se pueden aplicar ambas con prisma migrate deploy; la carga de los catálogos generales preexistentes sigue siendo necesaria. No usar reset en la base existente.

## Verificación

npm run build
node --import tsx --test tests/solicitud-alta.test.ts
npm test

Las pruebas usan MariaDB real con fixtures aisladas y limpian sus datos. El intercambio con Google se simula para probar el callback sin usar cuentas reales. El formulario visual no forma parte de este módulo backend; debe consumir el contrato anterior.
