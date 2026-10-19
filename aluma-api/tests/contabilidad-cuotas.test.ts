import test from "node:test";
import assert from "node:assert/strict";
import { fechaDesdeCalendario } from "../src/utils/fechaCalendario.ts";
import { interpretarConsulta, whereCuotas } from "../src/services/contabilidad/filtros.ts";
import { combinarMovimientos, presentarCuota } from "../src/services/contabilidad/presentacion.ts";
import { resumirContabilidad } from "../src/services/contabilidad/resumen.ts";

type Socio = { nombre: string; apellido1: string | null; apellido2: string | null };

function cuota(datos: {
  id_cuota: number;
  pagoAnio: number;
  fechaPago: string;
  importePagado: string;
  usuario: Socio;
}) {
  return {
    id_cuota: datos.id_cuota,
    pagoAnio: datos.pagoAnio,
    fechaPago: fechaDesdeCalendario(datos.fechaPago),
    importePagado: { toFixed: () => datos.importePagado },
    Usuario: datos.usuario,
  };
}

function contabilidad(cuotas: ReturnType<typeof cuota>[], cuotasCobradas: string, pendiente = "350.10") {
  const listado = combinarMovimientos([], cuotas.map(presentarCuota), "desc", 1, 100);
  const resumen = resumirContabilidad({
    sumasPorTipo: { Cobro: "0.00", "Devolución": "0.00" },
    pendiente,
    cuotasCobradas,
  });
  return { listado, resumen };
}

function filtro(query: Record<string, unknown>) {
  const consulta = interpretarConsulta(query);
  if ("error" in consulta || "vacia" in consulta) throw new Error("consulta de prueba no válida");
  return consulta.filtro;
}

function aniosBuscados(q: string): number[] | undefined {
  const where = whereCuotas(filtro({ q }));
  const anios = where?.OR?.find((opcion) => "pagoAnio" in opcion) as { pagoAnio?: { in?: number[] } } | undefined;
  return anios?.pagoAnio?.in;
}

const juan: Socio = { nombre: "Juan", apellido1: "Luis", apellido2: "Ramos" };
const luis: Socio = { nombre: "Luis", apellido1: "Pérez", apellido2: null };

test("crear una cuota deja un solo cobro y no toca el pendiente", () => {
  const alta = cuota({ id_cuota: 8, pagoAnio: 2026, fechaPago: "2026-03-01", importePagado: "30.00", usuario: juan });
  const { listado, resumen } = contabilidad([alta], "30.00");
  assert.equal(listado.total, 1);
  assert.equal(listado.movimientos.filter((fila) => fila.id === -8).length, 1);
  assert.equal(listado.movimientos[0]?.concepto, "Cuota 2026");
  assert.equal(listado.movimientos[0]?.tipo, "Cobro");
  assert.equal(listado.movimientos[0]?.fecha, "2026-03-01");
  assert.equal(listado.movimientos[0]?.usuario, "Juan Luis Ramos");
  assert.equal(listado.movimientos[0]?.importe, "30.00");
  assert.equal(resumen.totalCobrado, "30.00");
  assert.equal(resumen.saldoNeto, "30.00");
  assert.equal(resumen.pendienteCobro, "350.10");
  assert.equal(contabilidad([alta], "30.00").listado.total, 1);
});

test("editar la fecha, el año o el socio actualiza la misma entrada", () => {
  const original = cuota({ id_cuota: 8, pagoAnio: 2026, fechaPago: "2026-03-01", importePagado: "30.00", usuario: juan });
  const conFecha = cuota({ ...original, id_cuota: 8, pagoAnio: 2026, fechaPago: "2026-11-02", importePagado: "30.00", usuario: juan });
  const fecha = contabilidad([conFecha], "30.00");
  assert.equal(fecha.listado.movimientos[0]?.fecha, "2026-11-02");
  assert.equal(fecha.listado.movimientos.filter((fila) => fila.id === -8).length, 1);
  assert.equal(fecha.resumen.totalCobrado, "30.00");

  const conAnio = cuota({ id_cuota: 8, pagoAnio: 2027, fechaPago: "2026-11-02", importePagado: "35.00", usuario: juan });
  const anio = contabilidad([conAnio], "35.00");
  assert.equal(anio.listado.total, 1);
  assert.equal(anio.listado.movimientos[0]?.concepto, "Cuota 2027");
  assert.equal(anio.listado.movimientos[0]?.importe, "35.00");
  assert.equal(anio.resumen.totalCobrado, "35.00");
  assert.equal(anio.resumen.saldoNeto, "35.00");
  assert.equal(anio.resumen.pendienteCobro, "350.10");
  assert.deepEqual(aniosBuscados("2026"), [2026]);
  assert.deepEqual(aniosBuscados("2027"), [2027]);

  const conSocio = cuota({ id_cuota: 8, pagoAnio: 2027, fechaPago: "2026-11-02", importePagado: "35.00", usuario: luis });
  const socio = presentarCuota(conSocio);
  assert.equal(socio.usuario, "Luis Pérez");
  assert.equal(socio.id, -8);
  assert.equal(contabilidad([conSocio], "35.00").listado.total, 1);
});

test("el comentario no crea otro cobro y el importe histórico no sigue a la configuración", () => {
  const pagada = cuota({ id_cuota: 8, pagoAnio: 2026, fechaPago: "2026-03-01", importePagado: "30.00", usuario: juan });
  const antes = presentarCuota(pagada);
  const despues = presentarCuota(pagada);
  assert.deepEqual(antes, despues);
  assert.equal(contabilidad([pagada], "30.00").resumen.totalCobrado, "30.00");
  assert.equal(antes.importe, "30.00");
  assert.equal(Object.hasOwn(antes, "comentario"), false);
});

test("borrar la cuota la quita del listado y de los totales", () => {
  const { listado, resumen } = contabilidad([], "0.00");
  assert.equal(listado.total, 0);
  assert.deepEqual(listado.movimientos, []);
  assert.equal(resumen.totalCobrado, "0.00");
  assert.equal(resumen.saldoNeto, "0.00");
  assert.equal(resumen.pendienteCobro, "350.10");
});

test("cobro incluye la cuota, devolución y ajuste no, y la búsqueda usa el estado actual", () => {
  assert.notEqual(whereCuotas(filtro({ tipo: "Cobro" })), null);
  assert.equal(whereCuotas(filtro({ tipo: "Devolución" })), null);
  assert.equal(whereCuotas(filtro({ tipo: "Ajuste" })), null);
  assert.equal(whereCuotas(filtro({ q: "cuota" }))?.OR, undefined);
  assert.equal(JSON.stringify(whereCuotas(filtro({ q: "Juan" }))?.OR).includes("Juan"), true);
  assert.deepEqual(aniosBuscados("2026"), [2026]);
});
