import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, RequestHandler, Response } from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "ticketera_session";
const SESSION_DAYS = 7;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const expected = Buffer.from(hash, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// Hash de relleno: si el email no existe se verifica igual contra este, para que el
// tiempo de respuesta no revele qué emails tienen cuenta.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export async function verifyPasswordOrDummy(password: string, stored: string | undefined) {
  const ok = await verifyPassword(password, stored ?? (await DUMMY_HASH));
  return ok && stored !== undefined;
}

export async function startSession(res: Response, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    expires: expiresAt,
  });
}

export function readSessionToken(req: Request) {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    try {
      return decodeURIComponent(value.join("="));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function currentUser(req: Request) {
  const token = readSessionToken(req);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

// Exige un usuario logueado y lo deja disponible en res.locals.user.
export const requireUser: RequestHandler = async (req, res, next) => {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Tenés que iniciar sesión");
  res.locals.user = user;
  next();
};

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Tenés que iniciar sesión");
  if (user.role !== "ADMIN") throw new HttpError(403, "Solo para administradores");
  res.locals.user = user;
  next();
};

export function userOf(res: Response) {
  return res.locals.user as SessionUser;
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    approved: user.approvedAt !== null,
  };
}
