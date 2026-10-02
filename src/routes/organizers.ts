import { Router } from "express";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { onSaleWhere } from "../events.js";
import { withLots } from "../lots.js";

// Perfil público de un organizador: datos que él mismo cargó y sus eventos a la venta.
// Nunca incluye el email ni datos de su cuenta.
export const organizersRouter = Router();

export async function publicProfile(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, suspendedAt: null },
    select: { id: true, name: true, bio: true, instagram: true, website: true },
  });
  if (!user) return null;
  const events = await prisma.event.findMany({
    where: { organizerId: user.id, ...onSaleWhere() },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      name: true,
      imageFile: true,
      venue: true,
      startsAt: true,
      ticketTypes: {
        select: { id: true, name: true, priceCents: true, capacity: true, sold: true, salesEndAt: true, opensAfterId: true },
        orderBy: { priceCents: "asc" },
      },
    },
  });
  return { ...user, events: events.map((e) => ({ ...e, ticketTypes: withLots(e.ticketTypes) })) };
}

organizersRouter.get("/:id", async (req, res) => {
  const profile = await publicProfile(String(req.params.id).slice(0, 50));
  if (!profile) throw new HttpError(404, "Organizador no encontrado");
  res.json(profile);
});
