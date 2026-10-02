import { Router } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { onSaleWhere } from "../events.js";
import { withLots } from "../lots.js";
import { mapLinks } from "../maps.js";

// Rutas públicas: solo muestran eventos a la venta (publicados, de organizadores
// no suspendidos y que todavía no empezaron).
export const eventsRouter = Router();

const publicEvent = {
  id: true,
  name: true,
  description: true,
  imageFile: true,
  venue: true,
  address: true,
  startsAt: true,
  ticketTypes: {
    select: { id: true, name: true, priceCents: true, capacity: true, sold: true, salesEndAt: true, opensAfterId: true },
    orderBy: { priceCents: "asc" },
  },
} as const;

// Cada tipo de entrada lleva su estado de lote: a la venta, agotado, terminado o próximamente.
const withLotStatus = <T extends { ticketTypes: Parameters<typeof withLots>[0] }>(event: T) => ({
  ...event,
  ticketTypes: withLots(event.ticketTypes),
});

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: onSaleWhere(),
    orderBy: { startsAt: "asc" },
    select: publicEvent,
  });
  res.json(events.map(withLotStatus));
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findFirst({
    where: { id: req.params.id, ...onSaleWhere() },
    select: publicEvent,
  });
  if (!event) throw new HttpError(404, "Evento no encontrado o sin venta disponible");
  res.json({ ...withLotStatus(event), map: mapLinks(event.address), serviceFeePercent: config.serviceFeePercent });
});
