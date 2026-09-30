import { createApp } from "./app.js";
import { config } from "./config.js";
import { cleanupSessions, expireOrders } from "./orders.js";

createApp().listen(config.port, () => {
  console.log(`Ticketera escuchando en http://localhost:${config.port}`);
  if (config.simulatedPayments) {
    console.log("Pagos simulados activados: las compras se pueden confirmar sin cobrar.");
  }
});

// Cada minuto: vence órdenes impagas (liberando su cupo) y borra sesiones vencidas.
setInterval(() => {
  Promise.all([expireOrders(), cleanupSessions()]).catch((err) => {
    console.error("Error en la limpieza periódica", err);
  });
}, 60 * 1000).unref();
