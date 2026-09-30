import { createApp } from "./app.js";
import { backupDatabase } from "./backup.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { cleanupSessions, expireOrders } from "./orders.js";

// SQLite: modo WAL (lecturas y escrituras a la vez) y espera en vez de fallar si la base está ocupada.
await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL");
await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000");

// La cuenta de ADMIN_EMAIL pasa a ser administrador. Solo al arrancar y solo si ya existe:
// así nadie puede registrarse con ese email antes que vos y quedarse con la administración.
if (config.adminEmail) {
  const promoted = await prisma.user.updateMany({
    where: { email: config.adminEmail, role: { not: "ADMIN" } },
    data: { role: "ADMIN", suspendedAt: null },
  });
  if (promoted.count > 0) console.log(`${config.adminEmail} ahora es administrador.`);
  else if (!(await prisma.user.findUnique({ where: { email: config.adminEmail } }))) {
    console.log(`ADMIN_EMAIL: todavía no hay una cuenta con ${config.adminEmail}. Registrala y reiniciá el servidor.`);
  }
}

if (config.isProduction) {
  if (!process.env.PUBLIC_URL) console.warn("Falta PUBLIC_URL: los links de los mails van a apuntar a localhost.");
  if (config.sitePassword) console.log("Sitio en modo privado: pide contraseña para entrar.");
}

// En Express 5, si el puerto no se puede usar el error llega a este callback (no se lanza).
const server = createApp().listen(config.port, (error?: Error & { code?: string }) => {
  if (error) {
    if (error.code === "EADDRINUSE") {
      console.error(
        `\nEl puerto ${config.port} ya está en uso: probablemente ecko ya está abierto en otra terminal ` +
          `(por ejemplo con "npm run dev"). Cerralo con Ctrl+C en esa terminal y probá de nuevo.\n`,
      );
    } else {
      console.error("No se pudo arrancar el servidor:", error);
    }
    process.exit(1);
  }
  console.log(`ecko escuchando en http://localhost:${config.port}`);
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

// Copia de seguridad al arrancar (si no hay una de hoy) y después una vez por hora se revisa.
const runBackup = () =>
  backupDatabase()
    .then((file) => file && console.log(`Copia de seguridad: ${file}`))
    .catch((err) => console.error("No se pudo hacer la copia de seguridad", err));
runBackup();
setInterval(runBackup, 60 * 60 * 1000).unref();

// Al reiniciar o actualizar: deja de aceptar pedidos, termina los que están en curso y cierra la base.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log("Cerrando el servidor…");
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
