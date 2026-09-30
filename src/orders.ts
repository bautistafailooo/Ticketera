import { prisma } from "./db.js";

// Vence las órdenes pendientes cuyo plazo de pago terminó y libera su cupo.
// Es seguro correrlo en paralelo: cada orden se vence una sola vez.
export async function expireOrders(now = new Date()) {
  const stale = await prisma.order.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true },
    take: 200,
  });

  let expired = 0;
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.order.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      if (changed.count === 0) return;
      expired++;
      const perType = await tx.ticket.groupBy({
        by: ["ticketTypeId"],
        where: { orderId: id },
        _count: true,
      });
      for (const { ticketTypeId, _count } of perType) {
        await tx.ticketType.update({
          where: { id: ticketTypeId },
          data: { sold: { decrement: _count } },
        });
      }
    });
  }
  return expired;
}

// Borra sesiones vencidas.
export async function cleanupSessions(now = new Date()) {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
}
