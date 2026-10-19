import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/config/prisma.js";
import { requestId } from "../src/middlewares/request-id.middleware.js";
import authRoutes from "../src/routes/auth/routes.js";
import estadoInscripcionRoutes from "../src/routes/estado-inscripcion/routes.js";
import { errorMiddleware } from "../src/middlewares/error.middleware.js";

test("El catálogo de estados de inscripción solo devuelve id y nombre", async () => {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  app.use("/api/estados-inscripcion", estadoInscripcionRoutes);
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/api`;
  const marker = `estado-inscripcion-${randomUUID().slice(0, 8)}`;
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
    const estadosAntes = await prisma.estadoInscripcion.findMany({
      select: { id_estado_inscripcion: true, nombre: true },
      orderBy: { id_estado_inscripcion: "asc" },
    });

    async function crearUsuario(rol: "Usuario" | "Operador" | "Administrador") {
      const dbRole = await prisma.rolUsuario.findUniqueOrThrow({ where: { nombre_rol: rol } });
      const email = `${marker}-${users.length}@aluma.test`;
      const user = await prisma.usuario.create({ data: {
        id_tipo_documento: documentType.id_tipo_documento,
        numeroDocumento: `${marker}-${users.length}`,
        nombre: "Nombre catalogo",
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

    const usuario = await crearUsuario("Usuario");
    const operador = await crearUsuario("Operador");
    const administrador = await crearUsuario("Administrador");

    for (const token of [usuario, operador, administrador]) {
      const estados = await request("GET", "/estados-inscripcion", token);
      assert.equal(estados.status, 200);
      assert.deepEqual(estados.body, estadosAntes);
      const nombres = (estados.body as Array<{ nombre: string }>).map((estado) => estado.nombre);
      for (const nombre of ["Activa", "Cerrada"]) {
        assert.ok(nombres.includes(nombre));
      }
      for (const estado of estados.body as Array<Record<string, unknown>>) {
        assert.deepEqual(Object.keys(estado).sort(), ["id_estado_inscripcion", "nombre"]);
        assert.equal(typeof estado.id_estado_inscripcion, "number");
        assert.equal(typeof estado.nombre, "string");
      }
    }

    const anonimo = await request("GET", "/estados-inscripcion");
    assert.equal(anonimo.status, 401);
    for (const method of ["POST", "PUT", "DELETE"]) {
      const escritura = await request(method, "/estados-inscripcion", administrador, { nombre: "No guardar" });
      assert.equal(escritura.status, 404);
    }

    assert.deepEqual(await prisma.estadoInscripcion.findMany({
      select: { id_estado_inscripcion: true, nombre: true },
      orderBy: { id_estado_inscripcion: "asc" },
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
