export function filtroPendienteCobro(activaId: number | null, pendienteId: number | null) {
  if (activaId === null || pendienteId === null) return null;
  return { id_estado_inscripcion: activaId, id_estado_pago: pendienteId };
}

export function resumirContabilidad(datos: {
  sumasPorTipo: Readonly<Record<string, string>>;
  pendiente: string;
  cuotasCobradas?: string;
}) {
  const cobrado = centimos(datos.sumasPorTipo.Cobro ?? "0.00") + centimos(datos.cuotasCobradas ?? "0.00");
  const devuelto = absoluto(centimos(datos.sumasPorTipo["Devolución"] ?? "0.00"));
  return {
    totalCobrado: texto(cobrado),
    totalDevuelto: texto(devuelto),
    saldoNeto: texto(cobrado - devuelto),
    pendienteCobro: texto(centimos(datos.pendiente)),
  };
}

function centimos(importe: string): bigint {
  const textoImporte = importe.trim();
  const negativo = textoImporte.startsWith("-");
  const [entero = "0", decimal = ""] = textoImporte.replace(/^[+-]/, "").split(".");
  if (!/^\d+$/.test(entero) || !/^\d{0,2}$/.test(decimal)) {
    throw new Error("Importe contable no válido");
  }
  const valor = BigInt(entero) * 100n + BigInt((decimal + "00").slice(0, 2));
  return negativo ? -valor : valor;
}

function absoluto(valor: bigint): bigint {
  return valor < 0n ? -valor : valor;
}

function texto(valor: bigint): string {
  const negativo = valor < 0n;
  const abs = absoluto(valor);
  return `${negativo ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}
