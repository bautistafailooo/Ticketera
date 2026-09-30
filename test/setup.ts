import { beforeEach } from "vitest";
import { prisma } from "../src/db.js";

// Cada test arranca con la base vacía.
beforeEach(async () => {
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.event.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});
