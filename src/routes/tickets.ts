import { Router } from "express";
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const ticketsRouter = Router();

// Imagen QR de una entrada paga, para mostrar en pantalla o mandar por email.
ticketsRouter.get("/:code/qr.svg", async (req, res) => {
  const ticket = await prisma.ticket.findUnique({
    where: { code: req.params.code },
    include: { order: { select: { status: true } } },
  });
  if (!ticket || ticket.order.status !== "PAID") throw new HttpError(404, "Entrada inválida");
  const svg = await QRCode.toString(ticket.code, { type: "svg", margin: 1 });
  res.set("Cache-Control", "private, max-age=86400");
  res.type("image/svg+xml").send(svg);
});
