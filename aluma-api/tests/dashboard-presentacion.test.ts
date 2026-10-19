import test from "node:test";
import assert from "node:assert/strict";
import { presentarAsistencia, presentarProximas } from "../src/services/dashboard/presentacion.ts";

test("las próximas actividades reutilizan la ocupación y no suman la lista de espera", () => {
  const [actividad] = presentarProximas(
    [{ id_actividad: 4, titulo: "Taller", fecha: new Date("2026-10-20T00:00:00.000Z"), aforo: 20 }],
    [{ id_actividad: 4, total: 18 }],
    [{ id_actividad: 4, total: 3 }],
  );
  assert.equal(actividad.plazasOcupadas, 18);
  assert.equal(actividad.plazasDisponibles, 2);
  assert.equal(actividad.personasEnEspera, 3);
  assert.equal("inscritos" in actividad, false);
});

test("sin conteo de ocupación las plazas quedan a cero", () => {
  const [actividad] = presentarProximas(
    [{ id_actividad: 5, titulo: "Charla", fecha: new Date("2026-11-01T00:00:00.000Z"), aforo: null }],
    [],
    [],
  );
  assert.equal(actividad.plazasOcupadas, 0);
  assert.equal(actividad.plazasDisponibles, null);
  assert.equal(actividad.personasEnEspera, 0);
});

test("cada fecha de actividad cuenta una vez y los meses sin datos quedan a cero", () => {
  const ahora = new Date("2026-10-15T12:00:00.000Z");
  const ocupacion = presentarAsistencia([
    new Date("2026-10-01T00:00:00.000Z"),
    new Date("2026-10-20T00:00:00.000Z"),
    new Date("2025-01-04T00:00:00.000Z"),
    new Date("2024-10-01T00:00:00.000Z"),
  ], ahora);
  assert.equal(ocupacion.anioActual, 2026);
  assert.equal(ocupacion.anioAnterior, 2025);
  assert.equal(ocupacion.meses.length, 12);
  assert.equal(ocupacion.meses[9]?.actual, 2);
  assert.equal(ocupacion.meses[0]?.anterior, 1);
  assert.equal(ocupacion.meses[9]?.anterior, 0);
  assert.equal(ocupacion.meses.reduce((total, mes) => total + mes.actual + mes.anterior, 0), 3);
});

test("los años de la serie salen de la fecha de consulta", () => {
  const ocupacion = presentarAsistencia([], new Date("2027-03-01T00:00:00.000Z"));
  assert.equal(ocupacion.anioActual, 2027);
  assert.equal(ocupacion.anioAnterior, 2026);
  assert.equal(ocupacion.meses.length, 12);
  assert.equal(ocupacion.meses.every((mes) => mes.actual === 0 && mes.anterior === 0), true);
});
