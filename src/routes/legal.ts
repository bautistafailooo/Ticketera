import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { sendMail, sendInBackground } from "../mail/transport.js";
import * as templates from "../mail/templates.js";
import { rateLimits } from "../security.js";
import { resolveTicketCode } from "../ticket-code.js";

// Botón de arrepentimiento (Resolución 424/2020 de la Secretaría de Comercio Interior):
// el comprador puede revocar la compra con un formulario simple, sin registrarse, y recibe
// un código de trámite al instante. El pedido queda guardado y se avisa a los administradores.
export const legalRouter = Router();

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const newCode = () =>
  `ARR-${[...randomBytes(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("")}`;

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
  // Código de una entrada o el link de la compra (opcional: el pedido se registra igual).
  reference: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(1000).optional(),
});

// Busca la compra a partir del link (orden.html#<id>.<clave>) o del código de una entrada.
// Solo se vincula si el email coincide con el de la compra.
async function findOrder(reference: string | undefined, email: string) {
  if (!reference) return null;
  let orderId: string | null = null;
  const fromLink = reference.match(/orden\.html#([\w-]+)\./);
  if (fromLink) {
    orderId = fromLink[1];
  } else {
    const code = await resolveTicketCode(reference);
    if (code) orderId = (await prisma.ticket.findUnique({ where: { code }, select: { orderId: true } }))?.orderId ?? null;
  }
  if (!orderId) return null;
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: { select: { name: true } } } });
  if (!order || order.buyerEmail.trim().toLowerCase() !== email.trim().toLowerCase()) return null;
  return order;
}

legalRouter.post("/arrepentimiento", rateLimits.forgotPassword, async (req, res) => {
  const data = schema.parse(req.body);
  const order = await findOrder(data.reference, data.email);
  const request = await prisma.revocationRequest.create({
    data: {
      code: newCode(),
      name: data.name,
      email: data.email,
      reference: data.reference || null,
      reason: data.reason || null,
      orderId: order?.id ?? null,
    },
  });
  const eventName = order?.event.name ?? null;

  // La constancia con el código se manda en el momento (la norma pide darla dentro de las 24 h).
  sendInBackground("arrepentimiento", () =>
    sendMail({ to: request.email, ...templates.revocationReceived({ name: request.name, code: request.code, eventName }) }),
  );
  sendInBackground("arrepentimiento (admins)", async () => {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } });
    const message = templates.revocationForAdmins({ ...request, eventName, url: `${config.publicUrl}/admin.html#arrepentimientos` });
    for (const admin of admins) await sendMail({ to: admin.email, ...message });
  });

  res.status(201).json({ code: request.code, orderFound: order !== null });
});
