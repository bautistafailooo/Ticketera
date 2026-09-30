import { randomBytes } from "node:crypto";
import { prisma } from "./db.js";

// Códigos de entrada fáciles de leer y dictar, ej. "K7QM-4XTP-9HWD".
// Usa el alfabeto Base32 de Crockford: sin I, L, O ni U para evitar confusiones.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const GROUPS = 3;
const GROUP_SIZE = 4;
const LENGTH = GROUPS * GROUP_SIZE;

function group(chars: string) {
  return chars.match(new RegExp(`.{${GROUP_SIZE}}`, "g"))!.join("-");
}

export function generateTicketCode() {
  // 32 divide exacto a 256, así que cada carácter es igual de probable.
  const chars = [...randomBytes(LENGTH)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return group(chars);
}

// Lleva lo que tipeó una persona al formato canónico: ignora mayúsculas,
// espacios y guiones, y corrige O→0 e I/L→1. Devuelve null si no es un código válido.
export function normalizeTicketCode(input: string) {
  const chars = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (chars.length !== LENGTH || [...chars].some((c) => !ALPHABET.includes(c))) return null;
  return group(chars);
}

// Resuelve lo ingresado al código guardado: primero tal cual (QR o entradas con el
// formato anterior) y, si no aparece, en su forma normalizada (carga manual).
export async function resolveTicketCode(input: string) {
  const code = input.trim();
  if (await prisma.ticket.findUnique({ where: { code }, select: { id: true } })) return code;
  const normalized = normalizeTicketCode(code);
  if (!normalized || normalized === code) return null;
  const found = await prisma.ticket.findUnique({ where: { code: normalized }, select: { id: true } });
  return found ? normalized : null;
}
