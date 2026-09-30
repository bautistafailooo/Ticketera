import { hashPassword } from "./auth.js";
import { prisma } from "./db.js";

export const DEMO_ORGANIZER = { email: "organizador@ticketera.test", password: "ticketera123" };

// Crea un organizador de prueba y carga eventos de ejemplo a su nombre.
async function main() {
  const organizer =
    (await prisma.user.findUnique({ where: { email: DEMO_ORGANIZER.email } })) ??
    (await prisma.user.create({
      data: {
        name: "Organizador de prueba",
        email: DEMO_ORGANIZER.email,
        passwordHash: await hashPassword(DEMO_ORGANIZER.password),
      },
    }));
  console.log(`Organizador de prueba: ${DEMO_ORGANIZER.email} / ${DEMO_ORGANIZER.password}`);

  // Eventos cargados antes de que existieran los organizadores.
  const adopted = await prisma.event.updateMany({
    where: { organizerId: null },
    data: { organizerId: organizer.id },
  });
  if (adopted.count > 0) console.log(`Se asignaron ${adopted.count} eventos existentes al organizador de prueba.`);

  if ((await prisma.event.count()) > 0) {
    console.log("La base ya tiene eventos, no se cargan eventos de ejemplo.");
    return;
  }

  const events = [
    {
      name: "Noche de Rock Nacional",
      description: "Las mejores bandas del rock argentino en una sola noche.",
      venue: "Estadio Obras, Buenos Aires",
      startsAt: new Date("2026-11-14T21:00:00-03:00"),
      ticketTypes: [
        { name: "Campo", priceCents: 3500000, capacity: 500 },
        { name: "Platea", priceCents: 5500000, capacity: 200 },
      ],
    },
    {
      name: "Stand Up: Humor a la Carta",
      description: "Cuatro comediantes, una noche de risas.",
      venue: "Teatro Gran Rex, Buenos Aires",
      startsAt: new Date("2026-11-21T20:30:00-03:00"),
      ticketTypes: [
        { name: "General", priceCents: 2000000, capacity: 300 },
        { name: "VIP", priceCents: 4000000, capacity: 5 },
      ],
    },
    {
      name: "Festival Electrónico de Verano",
      venue: "Costanera Sur, Buenos Aires",
      startsAt: new Date("2026-12-12T18:00:00-03:00"),
      ticketTypes: [{ name: "Early Bird", priceCents: 4500000, capacity: 1000 }],
    },
  ];

  for (const { ticketTypes, ...event } of events) {
    await prisma.event.create({
      data: {
        ...event,
        status: "PUBLISHED",
        organizerId: organizer.id,
        ticketTypes: { create: ticketTypes },
      },
    });
  }
  console.log(`Se cargaron ${events.length} eventos de ejemplo.`);
}

await main();
await prisma.$disconnect();
