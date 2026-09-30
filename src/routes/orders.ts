import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { expireOrders } from "../orders.js";
import { rateLimits } from "../security.js";
import { generateTicketCode } from "../ticket-code.js";

export const ordersRouter = Router();

const MAX_TICKETS_PER_ORDER = 10;

const createOrderSchema = z.object({
  buyerName: z.string().trim().min(1).max(100),
  buyerEmail: z.email().max(200),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1).max(50),
        quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER),
      }),
    )
    .min(1)
    .max(10),
});

ordersRouter.post("/", rateLimits.orders, async (req, res) => {
  const { buyerName, buyerEmail, items } = createOrderSchema.parse(req.body);

  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQuantity > MAX_TICKETS_PER_ORDER) {
    throw new HttpError(400, `Podés comprar hasta ${MAX_TICKETS_PER_ORDER} entradas por compra`);
  }

  // Antes de reservar, libera el cupo de las órdenes vencidas.
  await expireOrders();

  const order = await prisma.$transaction(async (tx) => {
    let totalCents = 0;
    let eventId: string | null = null;
    const ticketsToCreate: { ticketTypeId: string; code: string; priceCents: number }[] = [];

    for (const item of items) {
      const ticketType = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
        include: { event: { include: { organizer: true } } },
      });
      if (!ticketType) throw new HttpError(404, "Tipo de entrada no encontrado");
      const { event } = ticketType;
      if (eventId && eventId !== event.id) {
        throw new HttpError(400, "Una compra solo puede incluir entradas de un evento");
      }
      eventId = event.id;
      if (event.status !== "PUBLISHED" || !event.organizer || event.organizer.suspendedAt) {
        throw new HttpError(409, "El evento no está a la venta");
      }
      if (event.startsAt <= new Date()) {
        throw new HttpError(409, "La venta de este evento terminó");
      }

      // Reserva atómica: solo incrementa si queda cupo, evitando sobreventa.
      const reserved = await tx.ticketType.updateMany({
        where: {
          id: ticketType.id,
          sold: { lte: ticketType.capacity - item.quantity },
        },
        data: { sold: { increment: item.quantity } },
      });
      if (reserved.count === 0) {
        throw new HttpError(409, `No quedan suficientes entradas "${ticketType.name}"`);
      }

      totalCents += ticketType.priceCents * item.quantity;
      for (let i = 0; i < item.quantity; i++) {
        ticketsToCreate.push({
          ticketTypeId: ticketType.id,
          code: generateTicketCode(),
          priceCents: ticketType.priceCents,
        });
      }
    }

    const free = totalCents === 0;
    return tx.order.create({
      data: {
        eventId: eventId!,
        accessToken: randomBytes(24).toString("base64url"),
        buyerName,
        buyerEmail,
        totalCents,
        // Las entradas gratis quedan confirmadas; las pagas esperan el pago.
        status: free ? "PAID" : "PENDING",
        expiresAt: free ? null : new Date(Date.now() + config.orderTtlMinutes * 60 * 1000),
        tickets: { create: ticketsToCreate },
      },
    });
  });

  res.status(201).json({
    id: order.id,
    accessToken: order.accessToken,
    status: order.status,
    totalCents: order.totalCents,
    expiresAt: order.expiresAt,
  });
});

// La orden solo se puede ver con su clave (header x-order-token).
async function findOrderWithToken(req: Request) {
  const token = req.header("x-order-token");
  if (!token) throw new HttpError(404, "Orden no encontrada");
  const order = await prisma.order.findUnique({
    where: { id: String(req.params.id), accessToken: token },
  });
  if (!order) throw new HttpError(404, "Orden no encontrada");
  return order;
}

ordersRouter.get("/:id", async (req, res) => {
  let order = await findOrderWithToken(req);
  if (order.status === "PENDING" && order.expiresAt && order.expiresAt < new Date()) {
    await expireOrders();
    order = await findOrderWithToken(req);
  }

  const full = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      event: { select: { id: true, name: true, venue: true, startsAt: true, imageFile: true } },
      tickets: { include: { ticketType: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const paid = full.status === "PAID";
  res.json({
    id: full.id,
    status: full.status,
    buyerName: full.buyerName,
    buyerEmail: full.buyerEmail,
    totalCents: full.totalCents,
    expiresAt: full.expiresAt,
    createdAt: full.createdAt,
    event: full.event,
    simulatedPayments: config.simulatedPayments,
    // Los códigos se entregan recién cuando la orden está paga.
    tickets: full.tickets.map((t) => ({
      ticketType: t.ticketType.name,
      priceCents: t.priceCents,
      code: paid ? t.code : null,
    })),
  });
});

// Pago simulado para desarrollo. Se reemplazará por Mercado Pago.
ordersRouter.post("/:id/simulate-payment", async (req, res) => {
  if (!config.simulatedPayments) throw new HttpError(404, "No disponible");
  const order = await findOrderWithToken(req);
  const paid = await prisma.order.updateMany({
    where: { id: order.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "PAID" },
  });
  if (paid.count === 0) {
    throw new HttpError(409, order.status === "PAID" ? "La orden ya está paga" : "La orden venció o ya no está pendiente");
  }
  res.json({ ok: true });
});
