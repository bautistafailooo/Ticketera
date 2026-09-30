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
import { ticketsRouter } from "./routes/tickets.js";
import { rateLimits, securityHeaders } from "./security.js";

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
  app.use(express.json({ limit: "20kb" }));
  app.use(express.static(path.join(import.meta.dirname, "../public")));
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
  app.use("/tickets", rateLimits.api, ticketsRouter);

  app.use(errorHandler);
  return app;
}
