import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUser, userOf } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { canEdit, isTrusted, visibility } from "../events.js";
import { expireOrders } from "../orders.js";

// Rutas del panel del organizador: requieren sesión y solo acceden a sus eventos.
export const organizerRouter = Router();
organizerRouter.use(requireUser);

const inTheFuture = (date: Date) => date.getTime() > Date.now();

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  venue: z.string().trim().min(1).max(200),
  startsAt: z.coerce.date().refine(inTheFuture, "Tiene que ser una fecha futura"),
});

const updateEventSchema = createEventSchema.partial();

const createTicketTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // Hasta $100.000.000 por entrada.
  priceCents: z.number().int().nonnegative().max(10_000_000_000),
  capacity: z.number().int().positive().max(1_000_000),
});

async function findOwnEvent(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizerId },
    include: { ticketTypes: { orderBy: { priceCents: "asc" } } },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  return event;
}

// Entradas pagas, recaudación y entradas validadas por tipo de entrada.
async function ticketStats(ticketTypeIds: string[]) {
  const [paid, checkedIn] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, order: { status: "PAID" } },
      _count: true,
      _sum: { priceCents: true },
    }),
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, usedAt: { not: null } },
      _count: true,
    }),
  ]);
  return {
    paid: new Map(paid.map((r) => [r.ticketTypeId, { count: r._count, revenueCents: r._sum.priceCents ?? 0 }])),
    checkedIn: new Map(checkedIn.map((r) => [r.ticketTypeId, r._count])),
  };
}

type TicketTypeRow = { id: string; name: string; priceCents: number; capacity: number; sold: number };

function withStats(ticketTypes: TicketTypeRow[], stats: Awaited<ReturnType<typeof ticketStats>>) {
  const rows = ticketTypes.map((t) => {
    const paid = stats.paid.get(t.id);
    return {
      ...t,
      paid: paid?.count ?? 0,
      checkedIn: stats.checkedIn.get(t.id) ?? 0,
      // Se suma el precio de cada entrada al momento de la compra.
      revenueCents: paid?.revenueCents ?? 0,
    };
  });
  const sum = (key: "capacity" | "sold" | "paid" | "checkedIn" | "revenueCents") =>
    rows.reduce((total, t) => total + t[key], 0);
  const totals = {
    capacity: sum("capacity"),
    sold: sum("sold"),
    paid: sum("paid"),
    checkedIn: sum("checkedIn"),
    revenueCents: sum("revenueCents"),
  };
  return { ticketTypes: rows, totals };
}

organizerRouter.get("/events", async (_req, res) => {
  await expireOrders();
  const events = await prisma.event.findMany({
    where: { organizerId: userOf(res).id },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: true },
  });
  const user = userOf(res);
  const stats = await ticketStats(events.flatMap((e) => e.ticketTypes.map((t) => t.id)));
  res.json(
    events.map(({ doorToken: _doorToken, ...event }) => ({
      ...event,
      ...withStats(event.ticketTypes, stats),
      visibility: visibility(event, user),
    })),
  );
});

organizerRouter.post("/events", async (req, res) => {
  const data = createEventSchema.parse(req.body);
  const event = await prisma.event.create({
    data: { ...data, organizerId: userOf(res).id },
  });
  res.status(201).json(event);
});

organizerRouter.get("/events/:id", async (req, res) => {
  await expireOrders();
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  const stats = await ticketStats(event.ticketTypes.map((t) => t.id));
  const orders = await prisma.order.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      buyerName: true,
      buyerEmail: true,
      status: true,
      totalCents: true,
      createdAt: true,
      _count: { select: { tickets: true } },
    },
  });
  const user = userOf(res);
  res.json({
    ...event,
    ...withStats(event.ticketTypes, stats),
    orders,
    visibility: visibility(event, user),
    editable: canEdit(event, user),
  });
});

function assertEditable(event: Parameters<typeof canEdit>[0], user: Parameters<typeof canEdit>[1]) {
  if (!canEdit(event, user)) {
    throw new HttpError(
      409,
      event.status === "PENDING_REVIEW"
        ? "El evento está en revisión: esperá la respuesta antes de modificarlo"
        : "Este evento ya no se puede modificar",
    );
  }
}

organizerRouter.patch("/events/:id", async (req, res) => {
  const data = updateEventSchema.parse(req.body);
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  assertEditable(event, user);
  // Se actualiza solo si el estado no cambió mientras tanto (por ejemplo, una revisión).
  const updated = await prisma.event.updateMany({
    where: { id: event.id, status: event.status },
    data,
  });
  if (updated.count === 0) throw new HttpError(409, "El evento cambió de estado. Recargá la página.");
  res.json(await prisma.event.findUniqueOrThrow({ where: { id: event.id } }));
});

organizerRouter.post("/events/:id/ticket-types", async (req, res) => {
  const data = createTicketTypeSchema.parse(req.body);
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  assertEditable(event, user);
  if (event.ticketTypes.some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
    throw new HttpError(409, "Ya existe un tipo de entrada con ese nombre");
  }
  const ticketType = await prisma.ticketType.create({
    data: { ...data, eventId: event.id },
  });
  res.status(201).json(ticketType);
});

// Publica el evento (organizador confiable) o lo envía a revisión (no confiable).
organizerRouter.post("/events/:id/publish", async (req, res) => {
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  if (user.suspendedAt) throw new HttpError(403, "Tu cuenta está suspendida");
  if (event.status !== "DRAFT" && event.status !== "REJECTED") {
    throw new HttpError(409, "El evento ya fue publicado o enviado a revisión");
  }
  if (event.ticketTypes.length === 0) {
    throw new HttpError(409, "El evento necesita al menos un tipo de entrada");
  }
  if (!inTheFuture(event.startsAt)) throw new HttpError(409, "La fecha del evento ya pasó");

  const status = isTrusted(user) ? "PUBLISHED" : "PENDING_REVIEW";
  const updated = await prisma.event.updateMany({
    where: { id: event.id, status: event.status },
    data: { status },
  });
  if (updated.count === 0) throw new HttpError(409, "El evento cambió de estado. Recargá la página.");
  res.json({ status });
});

// Genera (o regenera) el link de puerta del evento. El link anterior deja de funcionar.
organizerRouter.post("/events/:id/door-token", async (req, res) => {
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { doorToken: randomBytes(24).toString("base64url") },
  });
  res.json({ doorToken: updated.doorToken });
});
