import { Router } from "express";
import { z } from "zod";
import { requireUser, userOf } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

// Rutas del panel del organizador: requieren sesión y solo acceden a sus eventos.
export const organizerRouter = Router();
organizerRouter.use(requireUser);

const createEventSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  venue: z.string().trim().min(1),
  startsAt: z.coerce.date(),
});

const createTicketTypeSchema = z.object({
  name: z.string().trim().min(1),
  priceCents: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
});

async function findOwnEvent(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizerId },
    include: { ticketTypes: { orderBy: { priceCents: "asc" } } },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  return event;
}

// Entradas pagas y validadas por tipo de entrada, para calcular ventas y recaudación.
async function ticketStats(ticketTypeIds: string[]) {
  const [paid, checkedIn] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, order: { status: "PAID" } },
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, usedAt: { not: null } },
      _count: true,
    }),
  ]);
  const toMap = (rows: { ticketTypeId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.ticketTypeId, r._count]));
  return { paid: toMap(paid), checkedIn: toMap(checkedIn) };
}

type TicketTypeRow = { id: string; name: string; priceCents: number; capacity: number; sold: number };

function withStats(
  ticketTypes: TicketTypeRow[],
  stats: Awaited<ReturnType<typeof ticketStats>>,
) {
  const rows = ticketTypes.map((t) => {
    const paid = stats.paid.get(t.id) ?? 0;
    return {
      ...t,
      paid,
      checkedIn: stats.checkedIn.get(t.id) ?? 0,
      revenueCents: paid * t.priceCents,
    };
  });
  const totals = {
    capacity: rows.reduce((sum, t) => sum + t.capacity, 0),
    sold: rows.reduce((sum, t) => sum + t.sold, 0),
    paid: rows.reduce((sum, t) => sum + t.paid, 0),
    checkedIn: rows.reduce((sum, t) => sum + t.checkedIn, 0),
    revenueCents: rows.reduce((sum, t) => sum + t.revenueCents, 0),
  };
  return { ticketTypes: rows, totals };
}

organizerRouter.get("/events", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { organizerId: userOf(res).id },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: true },
  });
  const stats = await ticketStats(events.flatMap((e) => e.ticketTypes.map((t) => t.id)));
  res.json(events.map((event) => ({ ...event, ...withStats(event.ticketTypes, stats) })));
});

organizerRouter.post("/events", async (req, res) => {
  const data = createEventSchema.parse(req.body);
  const event = await prisma.event.create({
    data: { ...data, organizerId: userOf(res).id },
  });
  res.status(201).json(event);
});

organizerRouter.get("/events/:id", async (req, res) => {
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  const stats = await ticketStats(event.ticketTypes.map((t) => t.id));
  const orders = await prisma.order.findMany({
    where: { tickets: { some: { ticketType: { eventId: event.id } } } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { tickets: true } } },
  });
  res.json({ ...event, ...withStats(event.ticketTypes, stats), orders });
});

organizerRouter.post("/events/:id/ticket-types", async (req, res) => {
  const data = createTicketTypeSchema.parse(req.body);
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  if (event.ticketTypes.some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
    throw new HttpError(409, "Ya existe un tipo de entrada con ese nombre");
  }
  const ticketType = await prisma.ticketType.create({
    data: { ...data, eventId: event.id },
  });
  res.status(201).json(ticketType);
});

organizerRouter.post("/events/:id/publish", async (req, res) => {
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  if (event.status !== "DRAFT") throw new HttpError(409, "El evento ya fue publicado");
  if (event.ticketTypes.length === 0) {
    throw new HttpError(409, "El evento necesita al menos un tipo de entrada");
  }
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { status: "PUBLISHED" },
  });
  res.json(updated);
});
