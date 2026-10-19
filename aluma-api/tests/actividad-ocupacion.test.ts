import test from "node:test";
import assert from "node:assert/strict";
import { filtroPlazasOcupadas, resumirOcupacion } from "../src/services/actividad/ocupacion.ts";

const ACTIVA = 11;
const EN_ESPERA = 13;
const PENDIENTE = 21;
const PAGADO = 22;
const CERRADA = 12;
const CANCELADO = 31;
const DEVOLUCION = 32;

test("sin inscripciones la ocupación queda a cero", () => {
  const [actividad] = resumirOcupacion(
    [{ id_actividad: 1, aforo: 20 }],
    [],
    [],
  );
  assert.deepEqual(actividad, {
    id_actividad: 1,
    aforo: 20,
    plazasOcupadas: 0,
    plazasDisponibles: 20,
    personasEnEspera: 0,
  });
});

test("aforo nulo deja las plazas disponibles sin límite", () => {
  const [actividad] = resumirOcupacion(
    [{ id_actividad: 2, aforo: null }],
    [{ id_actividad: 2, total: 18 }],
    [],
  );
  assert.equal(actividad.aforo, null);
  assert.equal(actividad.plazasOcupadas, 18);
  assert.equal(actividad.plazasDisponibles, null);
  assert.equal(actividad.personasEnEspera, 0);
});

test("cuenta plazas disponibles, aforo completo y lista de espera", () => {
  const [libre, completa, espera] = resumirOcupacion(
    [
      { id_actividad: 3, aforo: 20 },
      { id_actividad: 4, aforo: 20 },
      { id_actividad: 5, aforo: 20 },
    ],
    [
      { id_actividad: 3, total: 18 },
      { id_actividad: 4, total: 20 },
    ],
    [{ id_actividad: 5, total: 4 }],
  );
  assert.deepEqual(
    { ocupadas: libre.plazasOcupadas, disponibles: libre.plazasDisponibles, espera: libre.personasEnEspera },
    { ocupadas: 18, disponibles: 2, espera: 0 },
  );
  assert.deepEqual(
    { ocupadas: completa.plazasOcupadas, disponibles: completa.plazasDisponibles },
    { ocupadas: 20, disponibles: 0 },
  );
  assert.equal(espera.personasEnEspera, 4);
  assert.equal(espera.plazasDisponibles, 20);
});

test("las plazas ocupadas usan solo Activa con pago Pendiente o Pagado", () => {
  const filtro = filtroPlazasOcupadas(ACTIVA, PENDIENTE, PAGADO);
  assert.deepEqual(filtro, {
    id_estado_inscripcion: ACTIVA,
    id_estado_pago: { in: [PENDIENTE, PAGADO] },
  });
  assert.equal(filtro?.id_estado_pago.in.includes(CANCELADO), false);
  assert.equal(filtro?.id_estado_pago.in.includes(DEVOLUCION), false);
  assert.notEqual(filtro?.id_estado_inscripcion, CERRADA);
  assert.notEqual(filtro?.id_estado_inscripcion, EN_ESPERA);
  assert.equal(filtroPlazasOcupadas(null, PENDIENTE, PAGADO), null);
  assert.equal(filtroPlazasOcupadas(ACTIVA, null, null), null);
  assert.deepEqual(filtroPlazasOcupadas(ACTIVA, PENDIENTE, null), {
    id_estado_inscripcion: ACTIVA,
    id_estado_pago: { in: [PENDIENTE] },
  });
  assert.deepEqual(filtroPlazasOcupadas(ACTIVA, null, PAGADO), {
    id_estado_inscripcion: ACTIVA,
    id_estado_pago: { in: [PAGADO] },
  });
});

test("un histórico por encima del aforo no deja plazas disponibles negativas", () => {
  const [actividad] = resumirOcupacion(
    [{ id_actividad: 9, aforo: 20 }],
    [{ id_actividad: 9, total: 25 }],
    [{ id_actividad: 9, total: 1 }],
  );
  assert.equal(actividad.plazasOcupadas, 25);
  assert.equal(actividad.plazasDisponibles, 0);
  assert.equal(actividad.aforo, 20);
  assert.equal(actividad.personasEnEspera, 1);
});
