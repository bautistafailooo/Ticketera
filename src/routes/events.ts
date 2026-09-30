import { Router } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { onSaleWhere } from "../events.js";

// Rutas públicas: solo muestran eventos a la venta (publicados, de organizadores
// no suspendidos y que todavía no empezaron).
export const eventsRouter = Router();

const publicEvent = {
  id: true,
  name: true,
  description: true,
  venue: true,
  startsAt: true,
  ticketTypes: {
    select: { id: true, name: true, priceCents: true, capacity: true, sold: true },
    orderBy: { priceCents: "asc" },
  },
} as const;

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: onSaleWhere(),
    orderBy: { startsAt: "asc" },
    select: publicEvent,
  });
  res.json(events);
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, ...onSaleWhere() },
    select: publicEvent,
  });
  if (!event) throw new HttpError(404, "Evento no encontrado o sin venta disponible");
  res.json(event);
});
