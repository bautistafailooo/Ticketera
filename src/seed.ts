import { hashPassword } from "./auth.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { setDemoImage } from "./demo-images.js";

export const DEMO_ORGANIZER = { email: "organizador@ticketera.test", password: "ticketera123" };

// Fecha a N días de hoy, a la hora indicada (hora de Argentina).
function daysFromNow(days: number, time: string) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const day = date.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  return new Date(`${day}T${time}:00-03:00`);
}

// Crea un organizador de prueba (administrador) y carga eventos de ejemplo a su nombre.
async function main() {
  if (config.isProduction) {
    console.error("El seed crea una cuenta con contraseña conocida: no se corre en producción.");
    process.exit(1);
  }

  const organizer = await prisma.user.upsert({
    where: { email: DEMO_ORGANIZER.email },
    update: { role: "ADMIN", suspendedAt: null, emailVerifiedAt: new Date() },
    create: {
      name: "Organizador de prueba",
      email: DEMO_ORGANIZER.email,
      passwordHash: await hashPassword(DEMO_ORGANIZER.password),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Administrador de prueba: ${DEMO_ORGANIZER.email} / ${DEMO_ORGANIZER.password}`);

  // Eventos cargados antes de que existieran los organizadores.
  const adopted = await prisma.event.updateMany({
    where: { organizerId: null },
    data: { organizerId: organizer.id },
  });
  if (adopted.count > 0) console.log(`Se asignaron ${adopted.count} eventos existentes al organizador de prueba.`);

  const upcoming = await prisma.event.count({ where: { startsAt: { gt: new Date() } } });
  if (upcoming > 0) {
    console.log("La base ya tiene eventos próximos, no se cargan eventos de ejemplo.");
    return;
  }

  const events = [
    {
      name: "Noche de Rock Nacional",
      description: "Las mejores bandas del rock argentino en una sola noche.",
      venue: "Estadio Obras",
      address: "Av. del Libertador 7395, CABA",
      startsAt: daysFromNow(30, "21:00"),
      ticketTypes: [
        { name: "Campo", priceCents: 3500000, capacity: 500 },
        { name: "Platea", priceCents: 5500000, capacity: 200 },
      ],
    },
    {
      name: "Stand Up: Humor a la Carta",
      description: "Cuatro comediantes, una noche de risas.",
      venue: "Teatro Gran Rex",
      address: "Av. Corrientes 857, CABA",
      startsAt: daysFromNow(45, "20:30"),
      ticketTypes: [
        { name: "General", priceCents: 2000000, capacity: 300 },
        { name: "VIP", priceCents: 4000000, capacity: 5 },
      ],
    },
    {
      name: "Festival Electrónico de Verano",
      venue: "Costanera Sur",
      address: "Av. Tristán Achával Rodríguez 1550, CABA",
      startsAt: daysFromNow(70, "18:00"),
      ticketTypes: [{ name: "Early Bird", priceCents: 4500000, capacity: 1000 }],
    },
  ];

  for (const [i, { ticketTypes, ...event }] of events.entries()) {
    const created = await prisma.event.create({
      data: {
        ...event,
        status: "PUBLISHED",
        organizerId: organizer.id,
        ticketTypes: { create: ticketTypes },
      },
    });
    await setDemoImage(created, i);
  }
  console.log(`Se cargaron ${events.length} eventos de ejemplo.`);
}

await main();
await prisma.$disconnect();
