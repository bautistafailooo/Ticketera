import QRCode from "qrcode";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { mapLinks } from "../maps.js";
import { sendMail } from "./transport.js";
import * as templates from "./templates.js";

export const orderUrl = (order: { id: string; accessToken: string }) =>
  `${config.publicUrl}/orden.html#${encodeURIComponent(order.id)}.${encodeURIComponent(order.accessToken)}`;

// Manda las entradas de una orden paga, con el QR de cada una adjunto.
export async function sendOrderConfirmation(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: { select: { name: true, venue: true, address: true, startsAt: true } },
      tickets: { include: { ticketType: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!order || order.status !== "PAID") return;

  const tickets = order.tickets.map((t, i) => ({ ticketType: t.ticketType.name, code: t.code, cid: `qr-${i}@ecko` }));
  const attachments = await Promise.all(
    tickets.map(async (t, i) => ({
      filename: `entrada-${i + 1}.png`,
      cid: t.cid,
      contentType: "image/png",
      content: await QRCode.toBuffer(t.code, { type: "png", width: 360, margin: 1 }),
    })),
  );
  const message = templates.orderConfirmed({
    buyerName: order.buyerName,
    complimentary: order.complimentary,
    totalCents: order.totalCents,
    feeCents: order.feeCents,
    orderUrl: orderUrl(order),
    event: order.event,
    directionsUrl: mapLinks(order.event.address)?.directionsUrl ?? null,
    tickets,
  });
  await sendMail({ to: order.buyerEmail, ...message, attachments });
  await prisma.order.update({ where: { id: order.id }, data: { emailedAt: new Date() } });
}

// Avisa al comprador que su pago llegó tarde y se le devolvió.
export async function sendPaymentRefunded(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: { select: { id: true, name: true } } } });
  if (!order) return;
  await sendMail({
    to: order.buyerEmail,
    ...templates.paymentRefunded({
      buyerName: order.buyerName,
      eventName: order.event.name,
      totalCents: order.totalCents,
      eventUrl: `${config.publicUrl}/evento.html?id=${encodeURIComponent(order.event.id)}`,
    }),
  });
}

// Avisa al comprador que su compra se anuló porque el dinero se le devolvió.
export async function sendOrderRefunded(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: { select: { name: true } } } });
  if (!order) return;
  await sendMail({
    to: order.buyerEmail,
    ...templates.orderRefunded({ buyerName: order.buyerName, eventName: order.event.name, totalCents: order.totalCents }),
  });
}

export async function sendEmailVerification(user: { email: string; name: string }, token: string) {
  const url = `${config.publicUrl}/verificar.html#${encodeURIComponent(token)}`;
  await sendMail({ to: user.email, ...templates.emailVerification({ name: user.name, url }) });
}

export async function sendPasswordReset(user: { email: string; name: string }, token: string) {
  const url = `${config.publicUrl}/restablecer.html#${encodeURIComponent(token)}`;
  await sendMail({ to: user.email, ...templates.passwordReset({ name: user.name, url }) });
}

// Avisa al organizador el resultado de una revisión o una pausa.
export async function notifyOrganizer(eventId: string, kind: "approved" | "rejected" | "paused" | "resumed") {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { organizer: true } });
  if (!event?.organizer) return;
  await sendMail({
    to: event.organizer.email,
    ...templates.eventReviewed({
      name: event.organizer.name,
      eventName: event.name,
      kind,
      note: event.reviewNote,
      url: `${config.publicUrl}/panel-evento.html?id=${encodeURIComponent(event.id)}`,
    }),
  });
}

// Avisa a los administradores que llegó un evento para revisar.
export async function notifyAdminsPendingReview(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { organizer: true } });
  if (!event) return;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
  const message = templates.eventPendingReview({
    eventName: event.name,
    organizerName: event.organizer?.name ?? "Un organizador",
    url: `${config.publicUrl}/admin.html`,
  });
  for (const admin of admins) await sendMail({ to: admin.email, ...message });
}
