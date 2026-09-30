import express from "express";
import usuarioRoutes from "./routes/usuario/routes.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import actividadRoutes from "./routes/actividad/routes.js";
import inscripcionActividadRoutes from "./routes/inscripcion-actividad/routes.js";
import movimientoContableRoutes from "./routes/movimiento/routes.js";

/**
 * Instancia principal de la aplicación Express.
 */

const app = express();

/**
 * Puerto en el que se ejecutará la API.
 */
const PORT = 3000;

/**
 * Permite recibir cuerpos de petición en formato JSON.
 */
app.use(express.json());

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


/**
 * Middleware global de errores.
 *
 * Debe registrarse después de todas las rutas.
 */
app.use(errorMiddleware);

/**
 * Middleware global de errores.
 */

app.listen(PORT, () => {
    console.log(`Servidor ALUMA escuchando en http://localhost:${PORT}`);
});