import { prisma } from "./db.js";

// Convierte una cuenta existente en administrador: npm run make-admin -- email@ejemplo.com
const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Uso: npm run make-admin -- email@ejemplo.com");
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No existe una cuenta con el email ${email}. Registrala primero desde /login.html.`);
  process.exit(1);
}

await prisma.user.update({
  where: { id: user.id },
  data: { role: "ADMIN", suspendedAt: null, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
});
console.log(`${email} ahora es administrador.`);
await prisma.$disconnect();
