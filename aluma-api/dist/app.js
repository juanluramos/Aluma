import solicitudAltaRoutes from "./routes/solicitud-alta/routes.js";
import express from "express";
import usuarioRoutes from "./routes/usuario/routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import actividadRoutes from "./routes/actividad/routes.js";
import inscripcionActividadRoutes from "./routes/inscripcion-actividad/routes.js";
import movimientoContableRoutes from "./routes/movimiento-contable/routes.js";
import authRouter from "./routes/auth/routes.js";
import { requestLogger } from "./middlewares/request-logger.middleware.js";
import { requestId } from "./middlewares/request-id.middleware.js";
import dashboardRoutes from "./routes/dashboard/routes.js";
import cors from "cors";
import { FRONTEND_ORIGIN } from "./config/session.js";
import { createServer } from "http";
import { initSocket } from "./socket/socket.js";
/**
 * Instancia principal de la aplicación Express.
 */
const app = express();
app.use(requestId);
app.use(requestLogger);
/**
 * Puerto en el que se ejecutará la API.
 */
const PORT = 3000;
/**
 * Permite recibir cuerpos de petición en formato JSON.
 */
app.use(express.json());
/**
 * Permite que páginas puedan conectar porque el navegador
 *  bloquea la petición
 */
app.use(cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
}));
/**
 * Ruta de comprobación de funcionamiento de la API.
 */
app.get("/", (_req, res) => {
    res.json({
        message: "ALUMA API funcionando",
    });
});
/**
 * Rutas del módulo de usuario
 *
 * Todas las rutas definidas dentro de usuarioRoutes
 * comenzarán por /api/usuarios
 */
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/actividades", actividadRoutes);
app.use("/api/inscripciones", inscripcionActividadRoutes);
app.use("/api/movimientos", movimientoContableRoutes);
app.use("/api/auth", authRouter);
app.use("/api/solicitudes-alta", solicitudAltaRoutes);
app.use("/api/dashboard", dashboardRoutes);
/**
 * Middleware global de errores.
 *
 * Debe registrarse después de todas las rutas.
 */
app.use(errorMiddleware);
/**
 * Middleware global de errores.
 */
const httpServer = createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, () => {
    console.log(`Servidor ALUMA escuchando en http://localhost:${PORT}`);
});
//# sourceMappingURL=app.js.map