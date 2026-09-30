import path from "node:path";
import express from "express";
import { errorHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { doorRouter } from "./routes/door.js";
import { eventsRouter } from "./routes/events.js";
import { ordersRouter } from "./routes/orders.js";
import { organizerRouter } from "./routes/organizer.js";
import { ticketsRouter } from "./routes/tickets.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(import.meta.dirname, "../public")));
  // Decodificador de QR para la app de puerta (navegadores sin BarcodeDetector).
  app.get("/vendor/jsQR.js", (_req, res) => {
    res.sendFile(path.join(import.meta.dirname, "../node_modules/jsqr/dist/jsQR.js"));
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter);
  app.use("/organizer", organizerRouter);
  app.use("/door", doorRouter);
  app.use("/events", eventsRouter);
  app.use("/orders", ordersRouter);
  app.use("/tickets", ticketsRouter);

  app.use(errorHandler);
  return app;
}
