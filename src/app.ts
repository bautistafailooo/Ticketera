import path from "node:path";
import express from "express";
import { errorHandler } from "./errors.js";
import { eventsRouter } from "./routes/events.js";
import { ordersRouter } from "./routes/orders.js";
import { ticketsRouter } from "./routes/tickets.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(import.meta.dirname, "../public")));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/events", eventsRouter);
  app.use("/orders", ordersRouter);
  app.use("/tickets", ticketsRouter);

  app.use(errorHandler);
  return app;
}
