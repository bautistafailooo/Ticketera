import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const ordersRouter = Router();

const MAX_TICKETS_PER_ITEM = 10;

const createOrderSchema = z.object({
  buyerName: z.string().min(1),
  buyerEmail: z.email(),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ITEM),
      }),
    )
    .min(1),
});

function generateTicketCode() {
  return randomBytes(9).toString("base64url");
}

ordersRouter.post("/", async (req, res) => {
  const { buyerName, buyerEmail, items } = createOrderSchema.parse(req.body);

  const order = await prisma.$transaction(async (tx) => {
    let totalCents = 0;
    const ticketsToCreate: { ticketTypeId: string; code: string }[] = [];

    for (const item of items) {
      const ticketType = await tx.ticketType.findUnique({
        where: { id: item.ticketTypeId },
        include: { event: true },
      });
      if (!ticketType) throw new HttpError(404, "Tipo de entrada no encontrado");
      if (ticketType.event.status !== "PUBLISHED") {
        throw new HttpError(409, "El evento no está a la venta");
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
        ticketsToCreate.push({ ticketTypeId: ticketType.id, code: generateTicketCode() });
      }
    }

    return tx.order.create({
      data: {
        buyerName,
        buyerEmail,
        totalCents,
        tickets: { create: ticketsToCreate },
      },
      include: { tickets: true },
    });
  });

  res.status(201).json(order);
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { tickets: true },
  });
  if (!order) throw new HttpError(404, "Orden no encontrada");
  res.json(order);
});

// Pago simulado: reemplazar por el webhook del proveedor de pagos (p. ej. Mercado Pago).
ordersRouter.post("/:id/pay", async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) throw new HttpError(404, "Orden no encontrada");
  if (order.status !== "PENDING") {
    throw new HttpError(409, "La orden no está pendiente de pago");
  }
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "PAID" },
    include: { tickets: true },
  });
  res.json(updated);
});
