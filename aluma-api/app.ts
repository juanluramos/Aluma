import express from "express";

/**
 * Instancia principal de la aplicación Express.
 *
 * Aquí se configurarán los middlewares, rutas
 * y demás comportamiento general de la API.
 */
const app = express();

/**
 * Puerto en el que se ejecutará la API.
 */
const PORT = 3000;

/**
 * Middleware que permite a Express interpretar
 * cuerpos de petición enviados en formato JSON.
 */
app.use(express.json());

/**
 * Ruta básica de comprobación.
 *
 * Sirve para verificar que la API está funcionando
 * correctamente antes de añadir rutas reales.
 */
app.get("/", (_req, res) => {
  res.json({
    message: "ALUMA API funcionando",
  });
});

/**
 * Inicia el servidor HTTP.
 */
app.listen(PORT, () => {
  console.log(`Servidor ALUMA escuchando en http://localhost:${PORT}`);
});