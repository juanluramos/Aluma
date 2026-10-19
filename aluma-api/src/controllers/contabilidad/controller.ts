import type { Request, Response } from "express";
import { interpretarConsulta } from "../../services/contabilidad/filtros.js";
import { getResumenContableService } from "../../services/contabilidad/service.js";

export async function getResumenContableController(req: Request, res: Response): Promise<void> {
  const consulta = interpretarConsulta({
    desde: req.query.desde,
    hasta: req.query.hasta,
    tipo: req.query.tipo,
    q: req.query.q,
  });
  if ("error" in consulta) {
    res.status(400).json({ message: consulta.error });
    return;
  }
  try {
    const datos = "vacia" in consulta ? undefined : consulta;
    res.status(200).json(await getResumenContableService(datos));
  } catch (error) {
    console.error("Error al obtener el resumen contable:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}
