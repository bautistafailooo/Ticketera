import { Router } from "express";
import { z } from "zod";
import { requireAdmin, userOf } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import type { EventStatus } from "../../generated/prisma/client.js";

// Administración de la plataforma: revisión de eventos y confianza en organizadores.
export const adminRouter = Router();
adminRouter.use(requireAdmin);

const noteSchema = z.object({ note: z.string().trim().min(1).max(500) });

// --- Eventos ---

adminRouter.get("/events", async (_req, res) => {
  const events = await prisma.event.findMany({
    where: { status: { not: "DRAFT" } },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      imageFile: true,
      venue: true,
      startsAt: true,
      status: true,
      reviewNote: true,
      organizer: { select: { id: true, name: true, email: true, trustedAt: true, suspendedAt: true } },
      ticketTypes: { select: { name: true, priceCents: true, capacity: true, sold: true }, orderBy: { priceCents: "asc" } },
    },
  });
  // Primero lo que espera revisión.
  const pendingFirst = [...events].sort(
    (a, b) => Number(b.status === "PENDING_REVIEW") - Number(a.status === "PENDING_REVIEW"),
  );
  res.json(pendingFirst);
});

// Cambia el estado de un evento solo si está en el estado esperado.
async function transition(eventId: string, from: EventStatus, to: EventStatus, note: string | null) {
  const updated = await prisma.event.updateMany({
    where: { id: eventId, status: from },
    data: { status: to, reviewNote: note, reviewedAt: new Date() },
  });
  if (updated.count === 0) {
    const exists = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    throw exists
      ? new HttpError(409, "El evento cambió de estado. Recargá la página.")
      : new HttpError(404, "Evento no encontrado");
  }
}

adminRouter.post("/events/:id/approve", async (req, res) => {
  await transition(req.params.id, "PENDING_REVIEW", "PUBLISHED", null);
  res.json({ ok: true });
});

adminRouter.post("/events/:id/reject", async (req, res) => {
  const { note } = noteSchema.parse(req.body);
  await transition(req.params.id, "PENDING_REVIEW", "REJECTED", note);
  res.json({ ok: true });
});

// Pausar saca el evento de la cartelera y frena la venta. Las entradas vendidas siguen valiendo en la puerta.
adminRouter.post("/events/:id/pause", async (req, res) => {
  const { note } = noteSchema.parse(req.body);
  await transition(req.params.id, "PUBLISHED", "PAUSED", note);
  res.json({ ok: true });
});

adminRouter.post("/events/:id/resume", async (req, res) => {
  await transition(req.params.id, "PAUSED", "PUBLISHED", null);
  res.json({ ok: true });
});

// --- Organizadores ---

adminRouter.get("/organizers", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      trustedAt: true,
      suspendedAt: true,
      createdAt: true,
      _count: { select: { events: true } },
    },
  });
  res.json(users);
});

async function findOrganizer(id: string, adminId: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, "Organizador no encontrado");
  if (user.id === adminId || user.role === "ADMIN") {
    throw new HttpError(409, "No se puede cambiar el estado de un administrador");
  }
  return user;
}

const organizerActions: Record<string, () => { trustedAt?: Date | null; suspendedAt?: Date | null }> = {
  trust: () => ({ trustedAt: new Date() }),
  untrust: () => ({ trustedAt: null }),
  // Suspender saca de la cartelera todos sus eventos y le impide publicar.
  suspend: () => ({ suspendedAt: new Date() }),
  unsuspend: () => ({ suspendedAt: null }),
};

for (const [action, data] of Object.entries(organizerActions)) {
  adminRouter.post(`/organizers/:id/${action}`, async (req, res) => {
    const user = await findOrganizer(String(req.params.id), userOf(res).id);
    await prisma.user.update({ where: { id: user.id }, data: data() });
    res.json({ ok: true });
  });
}
