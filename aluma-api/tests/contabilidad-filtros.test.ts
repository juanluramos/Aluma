import test from "node:test";
import assert from "node:assert/strict";
import {
  aniosConceptoCuota,
  incluirEnResumen,
  interpretarConsulta,
  rangoLocal,
  whereCuotas,
  whereMovimientos,
  whereTipo,
} from "../src/services/contabilidad/filtros.ts";
import { combinarMovimientos, diaLocal, presentarCuota, presentarMovimiento } from "../src/services/contabilidad/presentacion.ts";

test("un rango de un día usa la medianoche local y termina al día siguiente", () => {
  const rango = rangoLocal("2026-10-02", "2026-10-02");
  assert.ok(rango);
  assert.equal(rango.gte?.getTime(), new Date(2026, 9, 2).getTime());
  assert.equal(rango.lt?.getTime(), new Date(2026, 9, 3).getTime());
  assert.equal(rango.gte?.getHours(), 0);
});

test("la fecha mostrada conserva el día local", () => {
  assert.equal(diaLocal(new Date(2026, 9, 2, 0, 30)), "2026-10-02");
});

test("rechaza una fecha inicial posterior y un día inexistente", () => {
  assert.equal(
    interpretarConsulta({ desde: "2026-10-05", hasta: "2026-10-01" }).error,
    "La fecha inicial no puede ser posterior a la final.",
  );
  assert.equal(interpretarConsulta({ desde: "2026-02-31" }).error, "La fecha inicial no es válida.");
  assert.equal(interpretarConsulta({ tipo: "Traspaso" }).error, "Tipo de movimiento no válido.");
});

test("sin parámetros conserva la consulta vacía y con página pagina el listado", () => {
  assert.deepEqual(interpretarConsulta({}), { vacia: true });
  const consulta = interpretarConsulta({ pagina: "2", orden: "asc", tipo: "Todos" });
  assert.ok(!("error" in consulta) && !("vacia" in consulta));
  assert.equal(consulta.filtro.pagina, 2);
  assert.equal(consulta.filtro.orden, "asc");
  assert.equal(consulta.filtro.tipo, null);
  assert.equal(consulta.filtro.limite, 23);
});

test("el tipo limita las tarjetas y la búsqueda no toca el pendiente", () => {
  assert.deepEqual(incluirEnResumen(null), { cobro: true, devolucion: true });
  assert.deepEqual(incluirEnResumen("Cobro"), { cobro: true, devolucion: false });
  assert.deepEqual(incluirEnResumen("Devolución"), { cobro: false, devolucion: true });
  assert.deepEqual(incluirEnResumen("Ajuste"), { cobro: false, devolucion: false });
  const consulta = interpretarConsulta({ desde: "2026-10-01", tipo: "Cobro", q: "Ana" });
  assert.ok(!("error" in consulta) && !("vacia" in consulta));
  const cobro = whereTipo("Cobro", consulta.filtro, consulta.rango);
  assert.equal(cobro.TipoMovimiento.nombre, "Cobro");
  assert.equal("id_estado_pago" in cobro, false);
  assert.equal(cobro.OR?.some((opcion) => "concepto" in opcion), true);
});

test("el listado conserva el signo y deja vacías las relaciones ausentes", () => {
  const movimiento = presentarMovimiento({
    id_movimiento: 4,
    fecha: new Date(2026, 9, 3, 0, 0, 0),
    concepto: "Devolución inscripción",
    importe: { toFixed: () => "-25.50" },
    TipoMovimiento: { nombre: "Devolución" },
    InscripcionActividad: null,
  });
  assert.equal(movimiento.importe, "-25.50");
  assert.equal(movimiento.fecha, "2026-10-03");
  assert.equal(movimiento.usuario, null);
  assert.equal(movimiento.actividad, null);
  assert.equal(movimiento.metodoPago, null);
  const conRelacion = presentarMovimiento({
    id_movimiento: 5,
    fecha: new Date(2026, 9, 4),
    concepto: "Cobro inscripción",
    importe: { toFixed: () => "25.00" },
    TipoMovimiento: { nombre: "Cobro" },
    InscripcionActividad: {
      Usuario: { nombre: "Ana", apellido1: "Ruiz", apellido2: null },
      Actividad: { titulo: "Senderismo" },
      MetodoPago: { nombre: "Efectivo" },
    },
  });
  assert.equal(conRelacion.usuario, "Ana Ruiz");
  assert.equal(conRelacion.actividad, "Senderismo");
  assert.equal(conRelacion.metodoPago, "Efectivo");
  assert.equal(conRelacion.importe, "25.00");
  const filtro = interpretarConsulta({ q: "Senderismo" });
  assert.ok(!("error" in filtro) && !("vacia" in filtro));
  const where = whereMovimientos(filtro.filtro, filtro.rango);
  assert.equal(where.OR?.some((opcion) => JSON.stringify(opcion).includes("titulo")), true);
});

test("una cuota se presenta como cobro del año y entra en el listado", () => {
  const cuota = presentarCuota({
    id_cuota: 8,
    pagoAnio: 2026,
    fechaPago: new Date("2026-10-19T00:00:00.000Z"),
    importePagado: { toFixed: () => "30.00" },
    Usuario: { nombre: "Ana", apellido1: "García", apellido2: null },
  });
  assert.equal(cuota.id, -8);
  assert.equal(cuota.fecha, "2026-10-19");
  assert.equal(cuota.tipo, "Cobro");
  assert.equal(cuota.concepto, "Cuota 2026");
  assert.equal(cuota.usuario, "Ana García");
  assert.equal(cuota.actividad, null);
  assert.equal(cuota.metodoPago, null);
  assert.equal(cuota.importe, "30.00");

  const listado = combinarMovimientos(
    [{ id: 2, fecha: "2026-10-01", tipo: "Cobro", concepto: "Cobro inscripción", usuario: "Luis", actividad: "Taller", metodoPago: "Efectivo", importe: "12.00" }],
    [cuota],
    "desc",
    1,
    23,
  );
  assert.deepEqual(listado.movimientos.map((fila) => fila.id), [-8, 2]);
  assert.equal(listado.total, 2);
});

test("las cuotas solo acompañan a los cobros y se buscan por socio o año", () => {
  assert.equal(aniosConceptoCuota("cuota"), "todas");
  assert.deepEqual(aniosConceptoCuota("2026"), [2026]);
  assert.equal(aniosConceptoCuota("Ana"), "ninguno");

  const devolucion = interpretarConsulta({ tipo: "Devolución" });
  assert.ok(!("error" in devolucion) && !("vacia" in devolucion));
  assert.equal(whereCuotas(devolucion.filtro), null);

  const ajuste = interpretarConsulta({ tipo: "Ajuste" });
  assert.ok(!("error" in ajuste) && !("vacia" in ajuste));
  assert.equal(whereCuotas(ajuste.filtro), null);

  const cobro = interpretarConsulta({ tipo: "Cobro", q: "Ana", desde: "2026-10-01", hasta: "2026-10-31" });
  assert.ok(!("error" in cobro) && !("vacia" in cobro));
  const where = whereCuotas(cobro.filtro);
  assert.ok(where);
  assert.equal(where.fechaPago?.gte?.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(where.fechaPago?.lt?.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(JSON.stringify(where.OR).includes("Ana"), true);

  const porNombre = interpretarConsulta({ q: "Juan Soria" });
  assert.ok(!("error" in porNombre) && !("vacia" in porNombre));
  const whereNombre = JSON.stringify(whereCuotas(porNombre.filtro));
  assert.equal(whereNombre.includes("Juan"), true);
  assert.equal(whereNombre.includes("Soria"), true);

  const porAnio = interpretarConsulta({ q: "2026" });
  assert.ok(!("error" in porAnio) && !("vacia" in porAnio));
  const whereAnio = whereCuotas(porAnio.filtro);
  assert.equal(JSON.stringify(whereAnio?.OR).includes("2026"), true);
});

test("la búsqueda de varias palabras exige cada una en el nombre y el filtro de actividad limita cuotas", () => {
  const consulta = interpretarConsulta({ q: "Juan Soria", actividad: "4,sin" });
  assert.ok(!("error" in consulta) && !("vacia" in consulta));
  assert.deepEqual(consulta.filtro.actividad, { ids: [4], sinActividad: true });
  const where = JSON.stringify(whereMovimientos(consulta.filtro, consulta.rango));
  assert.equal(where.includes("Juan"), true);
  assert.equal(where.includes("Soria"), true);
  assert.equal(where.includes("id_actividad"), true);

  const soloActividad = interpretarConsulta({ actividad: "4" });
  assert.ok(!("error" in soloActividad) && !("vacia" in soloActividad));
  assert.equal(whereCuotas(soloActividad.filtro), null);

  const ninguna = interpretarConsulta({ actividad: "ninguna" });
  assert.ok(!("error" in ninguna) && !("vacia" in ninguna));
  assert.equal(JSON.stringify(whereMovimientos(ninguna.filtro, ninguna.rango)).includes("id_movimiento"), true);
  assert.equal(interpretarConsulta({ actividad: "abc" }).error, "Actividad no válida.");
});
