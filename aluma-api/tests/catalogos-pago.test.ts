import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { requestId } from "../src/middlewares/request-id.middleware.js";
import authRoutes from "../src/routes/auth/routes.js";
import metodoPagoRoutes from "../src/routes/metodo-pago/routes.js";
import estadoPagoRoutes from "../src/routes/estado-pago/routes.js";
import { errorMiddleware } from "../src/middlewares/error.middleware.js";

test("Los catálogos de pago solo devuelven id y nombre a quien gestiona pagos", async () => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/metodos-pago", metodoPagoRoutes);
  app.use("/api/estados-pago", estadoPagoRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `catalogo-${randomUUID().slice(0, 8)}`;
  const users: number[] = [];
  const requestIds: string[] = [];

  async function request(method: string, path: string, token?: string, body?: unknown) {
    const response = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    const id = response.headers.get("x-request-id");
    assert(id);
    requestIds.push(id);
    const texto = await response.text();
    let parsed: unknown = null;
    if (texto) {
      try {
        parsed = JSON.parse(texto) as unknown;
      } catch {
        parsed = texto;
      }
    }
    return { status: response.status, body: parsed };
  }

  try {
    const loginStatus = await prisma.estadoUsuario.findFirstOrThrow({ where: { permiteLogin: true } });
    const documentType = await prisma.tipoDocumentoIdentificacion.findFirstOrThrow();
    const password = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    const metodosAntes = await prisma.metodoPago.findMany({
      select: { id_metodo_pago: true, nombre: true },
      orderBy: { id_metodo_pago: "asc" },
    });
    const estadosAntes = await prisma.estadoPago.findMany({
      select: { id_estado_pago: true, nombre_estado: true },
      orderBy: { id_estado_pago: "asc" },
    });

    async function crearUsuario(rol: "Usuario" | "Operador" | "Administrador") {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: rol } });
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: marker,
        email,
        id_rol: dbRole.id_rol,
        socio: false,
        id_estado_usuario: loginStatus.id_estado_usuario,
        matriculaPagada: false,
      } });
      users.push(user.id_usuario);
      await prisma.cuentaAutenticacion.create({ data: {
        id_usuario: user.id_usuario, proveedor: "Local", email, password_hash: hash,
      } });
      const login = await request("POST", "/auth/login", undefined, { email, password });
      assert.equal(login.status, 200);
      assert(login.body && typeof login.body === "object" && "token" in login.body);
      return login.body.token as string;
    }

    const operador = await crearUsuario("Operador");
    const administrador = await crearUsuario("Administrador");
    const usuario = await crearUsuario("Usuario");

    for (const token of [operador, administrador]) {
      const metodos = await request("GET", "/metodos-pago", token);
      assert.equal(metodos.status, 200);
      assert.deepEqual(metodos.body, metodosAntes);
      for (const metodo of metodos.body as Array<Record<string, unknown>>) {
        assert.deepEqual(Object.keys(metodo).sort(), ["id_metodo_pago", "nombre"]);
        assert.equal(typeof metodo.id_metodo_pago, "number");
        assert.equal(typeof metodo.nombre, "string");
      }

      const estados = await request("GET", "/estados-pago", token);
      assert.equal(estados.status, 200);
      assert.deepEqual(estados.body, estadosAntes);
      const nombres = (estados.body as Array<{ nombre_estado: string }>).map((estado) => estado.nombre_estado);
      for (const nombre of ["Pendiente", "Pagado", "Devolución", "Cancelado"]) {
        assert.ok(nombres.includes(nombre));
      }
      for (const estado of estados.body as Array<Record<string, unknown>>) {
        assert.deepEqual(Object.keys(estado).sort(), ["id_estado_pago", "nombre_estado"]);
      }
      const serializado = JSON.stringify(estados.body);
      assert.equal(serializado.includes("requiereDatosPago"), false);
      assert.equal(serializado.includes("id_tipo_movimiento"), false);
    }

    for (const path of ["/metodos-pago", "/estados-pago"]) {
      const anonimo = await request("GET", path);
      assert.equal(anonimo.status, 401);
      const denegado = await request("GET", path, usuario);
      assert.equal(denegado.status, 403);
      assert(denegado.body && typeof denegado.body === "object" && "code" in denegado.body);
      assert.equal(denegado.body.code, "FORBIDDEN");
      for (const method of ["POST", "PUT", "DELETE"]) {
        const escritura = await request(method, path, administrador, { nombre: "No guardar" });
        assert.equal(escritura.status, 404);
      }
    }

    assert.deepEqual(await prisma.metodoPago.findMany({
      select: { id_metodo_pago: true, nombre: true },
      orderBy: { id_metodo_pago: "asc" },
    }), metodosAntes);
    assert.deepEqual(await prisma.estadoPago.findMany({
      select: { id_estado_pago: true, nombre_estado: true },
      orderBy: { id_estado_pago: "asc" },
    }), estadosAntes);
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
    await prisma.$transaction(async (tx) => {
      await tx.auditoria.deleteMany({ where: { requestId: { in: requestIds } } });
      await tx.cuentaAutenticacion.deleteMany({ where: { id_usuario: { in: users } } });
      await tx.usuario.deleteMany({ where: { id_usuario: { in: users } } });
    });
    await prisma.$disconnect();
  }
});
