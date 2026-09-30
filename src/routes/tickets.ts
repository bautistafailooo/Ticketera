import { Router } from "express";
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const ticketsRouter = Router();

// Validación en puerta: el código es lo que va dentro del QR.
ticketsRouter.post("/:code/check-in", async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { code: req.params.code },
    include: { order: true, ticketType: { include: { event: true } } },
  });
  if (!ticket) throw new HttpError(404, "Entrada inválida");
  if (ticket.order.status !== "PAID") {
    throw new HttpError(409, "La entrada no está paga");
  }

  const checkedIn = await prisma.ticket.updateMany({
    where: { id: ticket.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (checkedIn.count === 0) throw new HttpError(409, "La entrada ya fue usada");

  res.json({
    ok: true,
    event: ticket.ticketType.event.name,
    ticketType: ticket.ticketType.name,
    buyerName: ticket.order.buyerName,
  });
});

// Imagen QR de la entrada, para mostrar en pantalla o mandar por email.
ticketsRouter.get("/:code/qr.svg", async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { code: req.params.code } });
  if (!ticket) throw new HttpError(404, "Entrada inválida");
  const svg = await QRCode.toString(ticket.code, { type: "svg", margin: 1 });
  res.type("image/svg+xml").send(svg);
});
