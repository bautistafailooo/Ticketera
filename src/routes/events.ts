import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const eventsRouter = Router();

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  venue: z.string().min(1),
  startsAt: z.coerce.date(),
});

const createTicketTypeSchema = z.object({
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
});

eventsRouter.get("/", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: true },
  });
  res.json(events);
});

eventsRouter.post("/", async (req, res) => {
  const data = createEventSchema.parse(req.body);
  const event = await prisma.event.create({ data });
  res.status(201).json(event);
});

eventsRouter.get("/:id", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { ticketTypes: true },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  res.json(event);
});

eventsRouter.post("/:id/publish", async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { ticketTypes: true },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  if (event.ticketTypes.length === 0) {
    throw new HttpError(409, "El evento necesita al menos un tipo de entrada");
  }
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED" },
  });
  res.json(updated);
});

eventsRouter.post("/:id/ticket-types", async (req, res) => {
  const data = createTicketTypeSchema.parse(req.body);
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  const ticketType = await prisma.ticketType.create({
    data: { ...data, eventId: event.id },
  });
  res.status(201).json(ticketType);
});
