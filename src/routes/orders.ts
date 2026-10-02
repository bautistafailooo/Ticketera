import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import type { User } from "../../generated/prisma/client.js";
import { expireOrders } from "../orders.js";
import { rateLimits } from "../security.js";
import { sendOrderConfirmation } from "../mail/messages.js";
import { sendInBackground } from "../mail/transport.js";
import { serviceFee } from "../payments/fee.js";
import { createPreference, sellerToken } from "../payments/mercadopago.js";
import { markOrderPaid, syncOrderPayments } from "../payments/process.js";
import { mapLinks } from "../maps.js";
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
    let subtotalCents = 0;
    let eventId: string | null = null;
    let organizer: User | null = null;
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
      organizer = event.organizer;
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

      subtotalCents += ticketType.priceCents * item.quantity;
      for (let i = 0; i < item.quantity; i++) {
        ticketsToCreate.push({
          ticketTypeId: ticketType.id,
          code: generateTicketCode(),
          priceCents: ticketType.priceCents,
        });
      }
    }

    const free = subtotalCents === 0;
    if (!free && !canCharge(organizer!)) {
      throw new HttpError(409, "Este evento todavía no puede cobrar entradas. Probá más tarde.");
    }
    const feeCents = serviceFee(subtotalCents);
    return tx.order.create({
      data: {
        eventId: eventId!,
        accessToken: randomBytes(24).toString("base64url"),
        buyerName,
        buyerEmail,
        totalCents: subtotalCents + feeCents,
        feeCents,
        paidAt: free ? new Date() : null,
        // Las entradas gratis quedan confirmadas; las pagas esperan el pago.
        status: free ? "PAID" : "PENDING",
        expiresAt: free ? null : new Date(Date.now() + config.orderTtlMinutes * 60 * 1000),
        tickets: { create: ticketsToCreate },
      },
    });
  });

  // Las entradas gratis quedan pagas al instante: se mandan por mail en el momento.
  if (order.status === "PAID") sendInBackground("entradas", () => sendOrderConfirmation(order.id));

  res.status(201).json({
    id: order.id,
    accessToken: order.accessToken,
    status: order.status,
    totalCents: order.totalCents,
    feeCents: order.feeCents,
    expiresAt: order.expiresAt,
  });
});

// Si el organizador puede recibir pagos: con su Mercado Pago conectado, o con el pago simulado.
function canCharge(organizer: Pick<User, "mpAccessToken">) {
  return config.simulatedPayments || Boolean(config.mercadoPago && organizer.mpAccessToken);
}

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
      event: {
        select: {
          id: true,
          name: true,
          venue: true,
          address: true,
          startsAt: true,
          imageFile: true,
          organizer: { select: { mpAccessToken: true } },
        },
      },
      tickets: { include: { ticketType: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  const paid = full.status === "PAID";
  const { organizer, ...event } = full.event;
  res.json({
    id: full.id,
    status: full.status,
    buyerName: full.buyerName,
    buyerEmail: full.buyerEmail,
    totalCents: full.totalCents,
    feeCents: full.feeCents,
    expiresAt: full.expiresAt,
    createdAt: full.createdAt,
    refunded: full.refundedAt !== null,
    event: { ...event, directionsUrl: mapLinks(event.address)?.directionsUrl ?? null },
    // Cómo se puede pagar: con Mercado Pago (si el organizador conectó su cuenta) y, en pruebas, simulado.
    payment: {
      mercadoPago: Boolean(config.mercadoPago && organizer?.mpAccessToken),
      simulated: config.simulatedPayments,
    },
    // Los códigos se entregan recién cuando la orden está paga.
    tickets: full.tickets.map((t) => ({
      ticketType: t.ticketType.name,
      priceCents: t.priceCents,
      code: paid ? t.code : null,
    })),
  });
});

// Pago con Mercado Pago: crea el checkout con el token del organizador y devuelve el link para pagar.
// La vuelta (y la notificación de Mercado Pago) llevan solo el id de la orden, no su clave.
ordersRouter.post("/:id/checkout", rateLimits.orders, async (req, res) => {
  const order = await findOrderWithToken(req);
  if (order.status !== "PENDING" || !order.expiresAt || order.expiresAt <= new Date()) {
    throw new HttpError(409, order.status === "PAID" ? "La orden ya está paga" : "La reserva venció");
  }
  const full = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { event: { include: { organizer: true } }, tickets: { include: { ticketType: true } } },
  });
  const seller = full.event.organizer;
  if (!config.mercadoPago || !seller?.mpAccessToken) {
    throw new HttpError(409, "Este evento todavía no puede cobrar con Mercado Pago");
  }

  const lines = new Map<string, { title: string; quantity: number; unitPriceCents: number }>();
  for (const t of full.tickets) {
    const line = lines.get(t.ticketTypeId) ?? { title: `${full.event.name} - ${t.ticketType.name}`, quantity: 0, unitPriceCents: t.priceCents };
    line.quantity++;
    lines.set(t.ticketTypeId, line);
  }
  const items = [...lines.values()];
  if (full.feeCents > 0) items.push({ title: "Cargo por servicio", quantity: 1, unitPriceCents: full.feeCents });

  const preference = await createPreference(await sellerToken(seller), {
    orderId: full.id,
    items,
    feeCents: full.feeCents,
    expiresAt: full.expiresAt!,
    returnUrl: `${config.publicUrl}/orden.html?volver=${encodeURIComponent(full.id)}`,
    notificationUrl: `${config.publicUrl}/payments/mercadopago/webhook?order=${encodeURIComponent(full.id)}`,
  });
  res.json({ url: preference.init_point });
});

// Al volver de Mercado Pago: consulta el pago y actualiza la orden (por si la notificación no llegó).
ordersRouter.post("/:id/check-payment", rateLimits.orders, async (req, res) => {
  const order = await findOrderWithToken(req);
  const { paymentId } = z.object({ paymentId: z.string().regex(/^\d{1,20}$/).optional() }).parse(req.body ?? {});
  if (order.status !== "PAID" && config.mercadoPago) await syncOrderPayments(order.id, paymentId);
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  res.json({ status: updated.status });
});

// Pago simulado para probar sin cobrar. En producción está apagado (SIMULATED_PAYMENTS).
ordersRouter.post("/:id/simulate-payment", async (req, res) => {
  if (!config.simulatedPayments) throw new HttpError(404, "No disponible");
  const order = await findOrderWithToken(req);
  if (order.status !== "PENDING" || !order.expiresAt || order.expiresAt <= new Date() || !(await markOrderPaid(order.id))) {
    throw new HttpError(409, order.status === "PAID" ? "La orden ya está paga" : "La orden venció o ya no está pendiente");
  }
  res.json({ ok: true });
});

// Reenvía las entradas al mail del comprador (por si no le llegó o lo borró).
ordersRouter.post("/:id/resend-email", rateLimits.resendTickets, async (req, res) => {
  const order = await findOrderWithToken(req);
  if (order.status !== "PAID") throw new HttpError(409, "La orden todavía no está paga");
  await sendOrderConfirmation(order.id);
  res.json({ ok: true, email: order.buyerEmail });

});
