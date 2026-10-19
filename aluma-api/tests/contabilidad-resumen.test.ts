import test from "node:test";
import assert from "node:assert/strict";
import { filtroPendienteCobro, resumirContabilidad } from "../src/services/contabilidad/resumen.ts";

test("cobros, devoluciones y saldo usan céntimos y ignoran los ajustes", () => {
  const resumen = resumirContabilidad({
    sumasPorTipo: { Cobro: "1250.50", "Devolución": "-150.25", Ajuste: "80.00" },
    pendiente: "350.10",
  });
  assert.equal(resumen.totalCobrado, "1250.50");
  assert.equal(resumen.totalDevuelto, "150.25");
  assert.equal(resumen.saldoNeto, "1100.25");
  assert.equal(resumen.pendienteCobro, "350.10");
});

test("los céntimos no se pierden al restar", () => {
  const resumen = resumirContabilidad({
    sumasPorTipo: { Cobro: "0.10", "Devolución": "-0.20" },
    pendiente: "0.30",
  });
  assert.equal(resumen.totalCobrado, "0.10");
  assert.equal(resumen.totalDevuelto, "0.20");
  assert.equal(resumen.saldoNeto, "-0.10");
  assert.equal(resumen.pendienteCobro, "0.30");
});

test("las cuotas cobradas aumentan el total cobrado y el saldo", () => {
  const resumen = resumirContabilidad({
    sumasPorTipo: { Cobro: "10.00", "Devolución": "-4.00" },
    pendiente: "350.10",
    cuotasCobradas: "30.00",
  });
  assert.equal(resumen.totalCobrado, "40.00");
  assert.equal(resumen.totalDevuelto, "4.00");
  assert.equal(resumen.saldoNeto, "36.00");
  assert.equal(resumen.pendienteCobro, "350.10");
});

test("sin movimientos los cuatro importes quedan a cero", () => {
  const resumen = resumirContabilidad({ sumasPorTipo: {}, pendiente: "0.00" });
  assert.deepEqual(resumen, {
    totalCobrado: "0.00",
    totalDevuelto: "0.00",
    saldoNeto: "0.00",
    pendienteCobro: "0.00",
  });
});

test("el pendiente solo une Activa y Pendiente, buscados por nombre", () => {
  assert.deepEqual(filtroPendienteCobro(15, 11), {
    id_estado_inscripcion: 15,
    id_estado_pago: 11,
  });
  assert.equal(filtroPendienteCobro(null, 11), null);
  assert.equal(filtroPendienteCobro(15, null), null);
});
