import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { prisma } from "./db.js";

const KEEP = 7;

// Copia de seguridad de la base SQLite (una por día; se guardan las últimas 7).
// VACUUM INTO genera una copia consistente aunque haya ventas en curso.
export async function backupDatabase(now = new Date()) {
  if (!config.backupDir) return null;
  await mkdir(config.backupDir, { recursive: true });
  const file = path.join(config.backupDir, `ecko-${now.toISOString().slice(0, 10)}.db`);
  const existing = await readdir(config.backupDir);
  if (existing.includes(path.basename(file))) return null;

  await prisma.$executeRawUnsafe(`VACUUM INTO '${file.replaceAll("'", "''")}'`);

  const backups = (await readdir(config.backupDir)).filter((f) => /^ecko-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    await rm(path.join(config.backupDir, old), { force: true });
  }
  return file;
}
