import path from "node:path";
import express, { type RequestHandler } from "express";
import { config } from "./config.js";
import { errorHandler } from "./errors.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { doorRouter } from "./routes/door.js";
import { eventsRouter } from "./routes/events.js";
import { ordersRouter } from "./routes/orders.js";
import { organizerRouter } from "./routes/organizer.js";
import { paymentsRouter } from "./routes/payments.js";
import { ticketsRouter } from "./routes/tickets.js";
import { rateLimits, securityHeaders, sitePrivacy } from "./security.js";
import { sharePreviews } from "./share.js";

// Las respuestas de la API pueden tener datos personales o códigos de entrada:
// que ningún navegador ni proxy las guarde.
const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

export function createApp() {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.use(securityHeaders);
  app.use(sitePrivacy);
  app.use(express.json({ limit: "20kb" }));
  // Portada y páginas de eventos con la vista previa para compartir (antes de los archivos estáticos).
  app.get(["/", "/index.html", "/evento.html"], sharePreviews);
  app.use(express.static(path.join(import.meta.dirname, "../public")));
  // Flyers de los eventos. Los nombres son aleatorios y no cambian: se pueden cachear.
  app.use(
    "/media",
    express.static(config.uploadDir, { maxAge: "30d", immutable: true, index: false, dotfiles: "deny" }),
  );
  // Decodificador de QR para la app de puerta (navegadores sin BarcodeDetector).
  app.get("/vendor/jsQR.js", (_req, res) => {
    res.sendFile(path.join(import.meta.dirname, "../node_modules/jsqr/dist/jsQR.js"));
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const api = [rateLimits.api, noStore];
  app.use("/auth", api, authRouter);
  app.use("/admin", api, adminRouter);
  app.use("/organizer", api, organizerRouter);
  app.use("/door", api, doorRouter);
  app.use("/events", api, eventsRouter);
  app.use("/orders", api, ordersRouter);
  app.use("/payments", api, paymentsRouter);
  app.use("/tickets", rateLimits.api, ticketsRouter);

  app.use(errorHandler);
  return app;
}
