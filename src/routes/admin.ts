import { Router } from "express";
import { requireAdmin, userOf } from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

// Administración de la plataforma: aprobar organizadores antes de que puedan vender.
export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/organizers", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ approvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approvedAt: true,
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
    throw new HttpError(409, "No se puede cambiar la aprobación de un administrador");
  }
  return user;
}

adminRouter.post("/organizers/:id/approve", async (req, res) => {
  const user = await findOrganizer(req.params.id, userOf(res).id);
  await prisma.user.update({ where: { id: user.id }, data: { approvedAt: new Date() } });
  res.json({ ok: true });
});

// Quitar la aprobación saca de la cartelera todos sus eventos y frena sus ventas.
adminRouter.post("/organizers/:id/revoke", async (req, res) => {
  const user = await findOrganizer(req.params.id, userOf(res).id);
  await prisma.user.update({ where: { id: user.id }, data: { approvedAt: null } });
  res.json({ ok: true });
});
