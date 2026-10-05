# Inscripciones: permisos y contabilidad

Se conserva `/api/inscripciones`. Todas las rutas requieren JWT valido (401 si falta, es invalido o ha expirado). Los roles se comprueban con `authenticate` y `authorize` existentes.

| Operacion | Usuario | Operador | Administrador |
| --- | --- | --- | --- |
| GET inscripciones | Solo propias, filtro en Prisma | Todas | Todas |
| GET inscripcion por ID | Propia; ajena: 403 | Cualquiera | Cualquiera |
| POST inscripciones | Solo para si mismo; otro usuario: 403 | Cualquier usuario | Cualquier usuario |
| PUT inscripcion | 403 | Reglas contables | Reglas contables |
| DELETE inscripcion | 403 | 403 | Sin movimientos; con movimientos: 409 |
| GET movimientos | 403 | Permitido | Permitido |
| POST/PUT movimientos | 403 | Solo independientes | Solo independientes |
| DELETE movimiento | 403 | 403 | Solo independientes |

Un movimiento asociado no se puede crear, modificar, desvincular ni borrar directamente, ni siquiera como Administrador: 409 `ENROLLMENT_MOVEMENT_PROTECTED`. Las inscripciones generan sus movimientos mediante su servicio. Los movimientos independientes conservan la validacion de signo existente.

En POST, el `id_usuario` del body validado debe coincidir con el del JWT cuando el rol es Usuario. Una inscripcion Activa para ese usuario y actividad impide otra alta (409). Una anterior Cerrada por Devolucion permite crear una nueva con otro ID, conservando intactos la inscripcion anterior y sus movimientos. No cambia ninguna otra autorizacion ni regla contable.

## Estados comprobados en MariaDB

| ID pago | Nombre | Movimiento | Datos de pago |
| --- | --- | --- | --- |
| 1 | Pendiente | Ninguno | No obligatorios |
| 2 | Pagado | Cobro | Metodo y fecha obligatorios |
| 3 | Devolucion (nombre real con tilde) | Devolucion | Conserva datos del cobro |
| 4 | Cancelado | Ninguno | No obligatorios |

Estados de inscripcion: 1 `Activa`, 2 `Cerrada`. Metodo 1: `Bizum`. Estado de actividad 1: `Activo`. Estos IDs se usan solo en los ejemplos; el servicio consulta las relaciones y nombres reales, sin fijar IDs de catalogo.

## Transiciones y campos

| Situacion | Cambios permitidos | Efecto contable |
| --- | --- | --- |
| Alta Pendiente/Cancelado | Campos del DTO; siempre Activa | Ninguno |
| Alta Pagado | Precio positivo, metodo y fecha | Inscripcion y Cobro atomicos |
| Sin movimientos | Pendiente <-> Cancelado; correcciones de campos del DTO | Ninguno |
| Pendiente -> Pagado | Estado final Activa, precio positivo, metodo y fecha | Un Cobro positivo |
| Cancelado -> Pagado | Rechazado (409); debe pasar primero a Pendiente | Ninguno |
| Pagado -> Devolucion | Solo estado de pago, comentario y cierre | Un movimiento por el importe cobrado en negativo; Cerrada |
| Tras cobro | Solo comentario, salvo devolucion | Ninguno al editar comentario |
| Tras devolucion | Solo comentario | Ninguno |

Antes de cobrar pueden corregirse usuario, actividad, precio, metodo, fecha de pago, fecha de alta y estado de inscripcion. Se comprueban referencias y duplicados de inscripciones activas, tambien al reasignar o reabrir. No se anade una nueva politica de elegibilidad basada en `permiteInscripcion` ni en el estado de actividad.

Despues de cobrar se bloquean cambios efectivos en usuario, actividad, precio, metodo, ambas fechas y estado de inscripcion. La devolucion cierra automaticamente; un estado de inscripcion explicito incompatible se rechaza. Despues de devolver no se puede reabrir ni volver a cobrar. Repetir los mismos valores es idempotente: 200 sin generar otro movimiento.

No se admite alta en Devolucion ni devolver sin un unico cobro positivo coherente con el precio y la fecha registrados. Tampoco se permite pasar de Pagado a Pendiente/Cancelado. Los historiales existentes incoherentes se rechazan con 409 `INCONSISTENT_ACCOUNTING_HISTORY`; no se migran ni reparan automaticamente. No se implementan devoluciones parciales.

El precio admite hasta dos decimales y el rango de DECIMAL(10,2). Cero sigue admitido sin cobro, pero un estado Pagado exige importe positivo, como la regla de Cobro existente. Los DTOs de inscripcion rechazan campos desconocidos.

Las lecturas de validacion y las escrituras de inscripcion se ejecutan en una transaccion Serializable, con hasta tres intentos ante conflicto Prisma P2034. El cierre y la devolucion comparten escritura transaccional. No se modifica el schema ni el cliente generado, y no se utiliza SQL.

## Verificacion automatizada

Desde la raiz del proyecto, con MariaDB y los catalogos existentes disponibles:

```bash
npm run build
node --import tsx --test tests/inscripciones-security.test.ts
```

La prueba monta los routers reales en un puerto efimero y crea usuarios de los tres roles, cuentas locales y actividades nuevas. Obtiene JWT mediante login y solo los conserva en memoria. Verifica permisos, propiedad, referencias, transiciones, bloqueo de campos, cierre, concurrencia, creacion pagada y proteccion de movimientos.

El bloque final limpia exclusivamente las fixtures creadas por esa ejecucion, incluidos sus movimientos, mediante Prisma. No usa ni modifica los usuarios 1, 9 y 11 ni borra datos reales.

## Curl manual: login y datos propios de prueba

Ejecutar los bloques en orden en Bash con `curl` y `jq`. La API debe estar arrancada (`npm run dev`). Las contrasenas se solicitan sin eco y los tokens quedan en variables de la sesion, nunca en archivos. No activar `set -x`.

```bash
BASE=http://localhost:3000/api
login() {
  local password token
  read -r -s -p "Contrasena de $1: " password
  printf '\n' >&2
  token=$(printf '%s' "$password" | jq -Rs --arg email "$1" '{email:$email,password:.}' |
    curl --fail-with-body -sS "$BASE/auth/login" -H 'Content-Type: application/json' --data-binary @- |
    jq -er '.token') || return 1
  unset password
  printf '%s' "$token"
}
TU=$(login juan@email.com)
TO=$(login operador@aluma.test)
TA=$(login admin@aluma.test)

# Esta funcion muestra cuerpo y codigo HTTP; no imprime el token.
req() {
  local method=$1 path=$2 token=$3
  shift 3
  curl -sS -w '\nHTTP %{http_code}\n' -X "$method" "$BASE$path" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$@"
}

# Actividad NUEVA para evitar conflictos con inscripciones existentes.
ACT=$(curl --fail-with-body -sS -X POST "$BASE/actividades" \
  -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' \
  -d "{\"titulo\":\"Prueba permisos $(date +%s)\",\"id_estado_actividad\":1}" | jq -er '.id_actividad')
BODY_U=$(jq -nc --argjson act "$ACT" \
  '{id_usuario:1,id_actividad:$act,id_estado_pago:1,precioAplicado:25,apuntadoFecha:"2026-10-01"}')
BODY_O=$(jq -nc --argjson act "$ACT" \
  '{id_usuario:9,id_actividad:$act,id_estado_pago:1,precioAplicado:25,apuntadoFecha:"2026-10-01"}')

# POST Usuario para otro usuario: 403. POST Operador y Administrador: 201.
req POST /inscripciones "$TU" -d "$BODY_O"
IU=$(curl --fail-with-body -sS -X POST "$BASE/inscripciones" \
  -H "Authorization: Bearer $TO" -H 'Content-Type: application/json' -d "$BODY_U" | jq -er '.id_inscripcion')
IO=$(curl --fail-with-body -sS -X POST "$BASE/inscripciones" \
  -H "Authorization: Bearer $TA" -H 'Content-Type: application/json' -d "$BODY_O" | jq -er '.id_inscripcion')
```

## Curl: matriz de inscripciones

```bash
# Las cinco operaciones sin JWT: 401.
for spec in 'GET /inscripciones' "GET /inscripciones/$IU" 'POST /inscripciones' \
  "PUT /inscripciones/$IU" "DELETE /inscripciones/$IU"; do
  read -r verb path <<< "$spec"
  curl -sS -w '\nHTTP %{http_code}\n' -X "$verb" "$BASE$path"
done

# Usuario: listado propio y detalle propio 200; detalle ajeno 403.
req GET /inscripciones "$TU"
req GET "/inscripciones/$IU" "$TU"
req GET "/inscripciones/$IO" "$TU"

# Operador y Administrador: listado y ambos detalles 200.
for token in "$TO" "$TA"; do
  req GET /inscripciones "$token"
  req GET "/inscripciones/$IU" "$token"
  req GET "/inscripciones/$IO" "$token"
done

# PUT: Usuario 403; Operador y Administrador 200.
for token in "$TU" "$TO" "$TA"; do
  req PUT "/inscripciones/$IU" "$token" -d '{"comentario":"Prueba administrativa"}'
done

# DELETE: Usuario 403, Operador 403, Administrador 204.
# IO pertenece a la actividad de prueba recien creada y no tiene movimientos.
for token in "$TU" "$TO" "$TA"; do
  req DELETE "/inscripciones/$IO" "$token"
done
```

## Curl: cobro, devolucion y campos bloqueados

```bash
# Sin cobro previo: 409. Despues, cobrar: 200 y un Cobro de 25.
req PUT "/inscripciones/$IU" "$TO" -d '{"id_estado_pago":3}'
req PUT "/inscripciones/$IU" "$TO" \
  -d '{"id_estado_pago":2,"id_metodo_pago":1,"fechaPago":"2026-10-01"}'

# Cambios incompatibles tras cobro: todos 409.
for body in '{"precioAplicado":99}' '{"id_usuario":9}' '{"id_metodo_pago":null}' \
  '{"fechaPago":"2026-10-02"}' '{"apuntadoFecha":"2026-10-02"}' \
  '{"id_estado_pago":1}' '{"id_estado_inscripcion":2}'; do
  req PUT "/inscripciones/$IU" "$TA" -d "$body"
done
req DELETE "/inscripciones/$IU" "$TA" # 409: tiene movimientos.

# Devolver: 200, movimiento -25 y estado de inscripcion Cerrada.
req PUT "/inscripciones/$IU" "$TA" -d '{"id_estado_pago":3}'
req PUT "/inscripciones/$IU" "$TO" -d '{"comentario":"Devolucion revisada"}' # 200
req PUT "/inscripciones/$IU" "$TA" -d '{"id_estado_inscripcion":1}' # 409
req PUT "/inscripciones/$IU" "$TA" -d '{"id_estado_pago":2}' # 409
req PUT "/inscripciones/$IU" "$TA" -d '{"id_estado_pago":3}' # 200, sin duplicar.

# Usuario se reinscribe para si mismo: 201 y nuevo ID; el historico sigue cerrado.
req POST /inscripciones "$TU" -d "$BODY_U"
req GET "/inscripciones/$IU" "$TU" # 200: antigua Devolucion/Cerrada.
req POST /inscripciones "$TU" -d "$BODY_U" # 409: ya tiene una nueva Activa.
```

## Curl: rutas contables

```bash
MC=$(curl --fail-with-body -sS "$BASE/movimientos" -H "Authorization: Bearer $TA" |
  jq -er --argjson id "$IU" '[.[] | select(.id_inscripcion==$id)][0].id_movimiento')

# Sin JWT: 401 en las cinco operaciones.
for spec in 'GET /movimientos' "GET /movimientos/$MC" 'POST /movimientos' \
  "PUT /movimientos/$MC" "DELETE /movimientos/$MC"; do
  read -r verb path <<< "$spec"
  curl -sS -w '\nHTTP %{http_code}\n' -X "$verb" "$BASE$path"
done

# Usuario: siempre 403. Operador/Admin: GET 200.
for token in "$TU" "$TO" "$TA"; do
  req GET /movimientos "$token"
  req GET "/movimientos/$MC" "$token"
  # PUT vinculado: Usuario 403; Operador/Admin 409.
  req PUT "/movimientos/$MC" "$token" -d '{"id_inscripcion":null}'
  # DELETE vinculado: Usuario/Operador 403; Admin 409.
  req DELETE "/movimientos/$MC" "$token"
  # POST vinculado: Usuario 403; Operador/Admin 409.
  req POST /movimientos "$token" \
    -d "{\"id_tipo_movimiento\":1,\"concepto\":\"Prueba\",\"importe\":25,\"fecha\":\"2026-10-01\",\"id_inscripcion\":$IU}"
done

# POST y PUT independientes: Operador y Administrador permitidos.
for token in "$TO" "$TA"; do
  MI=$(curl --fail-with-body -sS -X POST "$BASE/movimientos" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"id_tipo_movimiento":3,"concepto":"Prueba independiente","importe":5,"fecha":"2026-10-01"}' |
    jq -er '.id_movimiento')
  req PUT "/movimientos/$MI" "$token" -d '{"importe":6}' # 200
  req PUT "/movimientos/$MI" "$token" -d "{\"id_inscripcion\":$IU}" # 409
  req DELETE "/movimientos/$MI" "$TO" # 403
  req DELETE "/movimientos/$MI" "$TA" # 204; solo el movimiento de prueba creado arriba.
done
unset TU TO TA token
```

La prueba manual deja la actividad y la inscripcion devuelta con su historial: la API impide borrarlas. Para verificacion repetible con limpieza automatica usa la prueba de integracion, que elimina solo sus propias fixtures. Los curl no se han ejecutado con las cuentas 1, 9 y 11 porque sus contrasenas no se han proporcionado; la prueba automatizada usa cuentas nuevas y login real.

## Archivos modificados

Fuentes:

- `src/controllers/inscripcion-actividad/controller.ts`
- `src/middlewares/auth/authorize-enrollment-create.middleware.ts` (nuevo)
- `src/dtos/inscripcion-actividad/create-enrollment.dto.ts`
- `src/dtos/inscripcion-actividad/update-enrollment.dto.ts`
- `src/repositories/inscripcion-actividad/repository.ts`
- `src/repositories/movimiento-contable/repository.ts`
- `src/routes/inscripcion-actividad/routes.ts`
- `src/routes/movimiento-contable/routes.ts`
- `src/services/inscripcion-actividad/service.ts`
- `src/services/movimiento-contable/service.ts`

Creados:

- `tests/inscripciones-security.test.ts`
- `docs/inscripciones-seguridad.md`

Actualizados por `npm run build` (el repositorio versiona `dist`):

- `dist/controllers/inscripcion-actividad/controller.js`
- `dist/controllers/inscripcion-actividad/controller.js.map`
- `dist/middlewares/auth/authorize-enrollment-create.middleware.js`
- `dist/middlewares/auth/authorize-enrollment-create.middleware.js.map`
- `dist/dtos/inscripcion-actividad/create-enrollment.dto.js`
- `dist/dtos/inscripcion-actividad/create-enrollment.dto.js.map`
- `dist/dtos/inscripcion-actividad/update-enrollment.dto.js`
- `dist/dtos/inscripcion-actividad/update-enrollment.dto.js.map`
- `dist/repositories/inscripcion-actividad/repository.js`
- `dist/repositories/inscripcion-actividad/repository.js.map`
- `dist/repositories/movimiento-contable/repository.js`
- `dist/repositories/movimiento-contable/repository.js.map`
- `dist/routes/inscripcion-actividad/routes.js`
- `dist/routes/inscripcion-actividad/routes.js.map`
- `dist/routes/movimiento-contable/routes.js`
- `dist/routes/movimiento-contable/routes.js.map`
- `dist/services/inscripcion-actividad/service.js`
- `dist/services/inscripcion-actividad/service.js.map`
- `dist/services/movimiento-contable/service.js`
- `dist/services/movimiento-contable/service.js.map`
