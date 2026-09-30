import { execSync } from "node:child_process";

// Aplica las migraciones a la base de tests; cada test limpia las tablas en beforeEach.
export default function setup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "ignore",
  });
}
