import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { rateLimits } from "../security.js";
import { resolveTicketCode } from "../ticket-code.js";

// App de puerta: se autoriza con la clave del link de puerta del evento
// (header x-door-token) y solo puede validar entradas de ese evento.
export const doorRouter = Router();
doorRouter.use(rateLimits.door);

const checkInSchema = z.object({ code: z.string().trim().min(1).max(40) });

async function eventForDoor(req: Request) {
  const token = req.header("x-door-token");
  if (!token) throw new HttpError(401, "Falta el código de acceso de puerta");
  const event = await prisma.event.findUnique({ where: { doorToken: token } });
  if (!event) throw new HttpError(401, "El link de puerta no es válido o fue regenerado");
  return event;
}

async function doorStats(eventId: string) {
  const [paid, checkedIn] = await Promise.all([
    prisma.ticket.count({ where: { ticketType: { eventId }, order: { status: "PAID" } } }),
    prisma.ticket.count({ where: { ticketType: { eventId }, usedAt: { not: null } } }),
  ]);
  return { paid, checkedIn };
}

doorRouter.get("/event", async (req, res) => {
  const event = await eventForDoor(req);
  res.json({
    id: event.id,
    name: event.name,
    venue: event.venue,
    startsAt: event.startsAt,
    stats: await doorStats(event.id),
  });
});

doorRouter.post("/check-in", async (req, res) => {
  const event = await eventForDoor(req);
  const { code: input } = checkInSchema.parse(req.body);

  const code = await resolveTicketCode(input);
  if (!code) throw new HttpError(404, "Entrada inválida");
  const ticket = await prisma.ticket.findUniqueOrThrow({
    where: { code },
    include: { order: true, ticketType: true },
  });
  if (ticket.ticketType.eventId !== event.id) {
    throw new HttpError(409, "Esta entrada es de otro evento");
  }
  if (ticket.order.status !== "PAID") {
    throw new HttpError(409, "La entrada no está paga");
  }

  const checkedIn = await prisma.ticket.updateMany({
    where: { id: ticket.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (checkedIn.count === 0) {
    const current = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    throw new HttpError(409, "La entrada ya fue usada", {
      usedAt: current.usedAt,
      ticketType: ticket.ticketType.name,
      buyerName: ticket.order.buyerName,
    });
  }

  res.json({
    ok: true,
    ticketType: ticket.ticketType.name,
    buyerName: ticket.order.buyerName,
    stats: await doorStats(event.id),
  });
});
