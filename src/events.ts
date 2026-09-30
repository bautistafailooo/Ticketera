import type { EventStatus, UserRole } from "../generated/prisma/client.js";

type Organizer = { role: UserRole; trustedAt: Date | null; suspendedAt: Date | null };
type EventLike = { status: EventStatus; startsAt: Date };

// Los administradores y los organizadores confiables publican sin revisión.
export function isTrusted(user: Organizer) {
  return user.role === "ADMIN" || user.trustedAt !== null;
}

// Evento a la venta: publicado, de un organizador no suspendido y que todavía no empezó.
export const onSaleWhere = () => ({
  status: "PUBLISHED" as const,
  startsAt: { gt: new Date() },
  organizer: { suspendedAt: null },
});

// Qué eventos puede modificar el organizador (datos y tipos de entrada).
// Uno no confiable solo edita lo que todavía no fue aprobado, para no saltear la revisión.
export function canEdit(event: EventLike, user: Organizer) {
  if (event.status === "DRAFT" || event.status === "REJECTED") return true;
  return event.status === "PUBLISHED" && isTrusted(user);
}

// Si el evento aparece en la cartelera y, si no, por qué.
export function visibility(event: EventLike, organizer: Organizer) {
  if (organizer.suspendedAt) return { visible: false, reason: "Tu cuenta está suspendida" };
  switch (event.status) {
    case "DRAFT":
      return { visible: false, reason: isTrusted(organizer) ? "Falta publicarlo" : "Falta enviarlo a revisión" };
    case "PENDING_REVIEW":
      return { visible: false, reason: "Esperando la revisión de un administrador" };
    case "REJECTED":
      return { visible: false, reason: "Fue rechazado: corregilo y volvé a enviarlo" };
    case "PAUSED":
      return { visible: false, reason: "Fue pausado por un administrador" };
    case "CANCELLED":
      return { visible: false, reason: "Está cancelado" };
    case "PUBLISHED":
      return event.startsAt > new Date()
        ? { visible: true, reason: null }
        : { visible: false, reason: "El evento ya pasó" };
  }
}
