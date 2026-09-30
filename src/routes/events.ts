import { Router } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

// Rutas públicas: solo muestran eventos publicados.
export const eventsRouter = Router();

const publicTicketType = {
  select: { id: true, name: true, priceCents: true, capacity: true, sold: true },
} as const;

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: publicTicketType },
  });
  res.json(events);
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id, status: "PUBLISHED" },
    include: { ticketTypes: publicTicketType },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  res.json(event);
});
