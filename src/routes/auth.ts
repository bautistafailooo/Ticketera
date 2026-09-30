import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import {
  SESSION_COOKIE,
  currentUser,
  hashPassword,
  publicUser,
  readSessionToken,
  startSession,
  verifyPasswordOrDummy,
} from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { sendPasswordReset } from "../mail/messages.js";
import { sendInBackground } from "../mail/transport.js";
import { rateLimits } from "../security.js";

export const authRouter = Router();

const email = z.email().max(200).transform((e) => e.toLowerCase());

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password: z.string().min(8, "Tiene que tener al menos 8 caracteres").max(200),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

// Las cuentas nuevas quedan pendientes: pueden preparar eventos, pero no publicarlos
// hasta que un administrador las apruebe.
authRouter.post("/register", rateLimits.auth, async (req, res) => {
  const { name, email, password } = registerSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email } })) {
    throw new HttpError(409, "Ya existe una cuenta con ese email");
  }
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });
  await startSession(res, user.id);
  res.status(201).json(publicUser(user));
});

authRouter.post("/login", rateLimits.auth, rateLimits.loginPerAccount, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPasswordOrDummy(password, user?.passwordHash);
  if (!user || !valid) {
    throw new HttpError(401, "Email o contraseña incorrectos");
  }
  await startSession(res, user.id);
  res.json(publicUser(user));
});

authRouter.post("/logout", async (req, res) => {
  const token = readSessionToken(req);
  if (token) await prisma.session.deleteMany({ where: { token } });
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const user = await currentUser(req);
  if (!user) throw new HttpError(401, "Tenés que iniciar sesión");
  res.json(publicUser(user));
});

// --- Olvidé mi contraseña ---

const RESET_MINUTES = 60;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const forgotSchema = z.object({ email });
const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8, "Tiene que tener al menos 8 caracteres").max(200),
});

// Siempre responde lo mismo, exista o no la cuenta, para no revelar qué emails están registrados.
authRouter.post("/forgot", rateLimits.forgotPassword, rateLimits.forgotPasswordPerEmail, async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordReset.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
      },
    });
    sendInBackground("olvidé mi contraseña", () => sendPasswordReset(user, token));
  }
  res.json({ ok: true });
});

authRouter.post("/reset", rateLimits.forgotPassword, async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    throw new HttpError(400, "El link venció o ya se usó. Pedí uno nuevo.");
  }
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    // Se marca como usado solo si nadie lo usó en paralelo.
    const used = await tx.passwordReset.updateMany({
      where: { id: reset.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new HttpError(400, "El link venció o ya se usó. Pedí uno nuevo.");
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    // Invalida los demás links pendientes y cierra todas las sesiones abiertas.
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
  });
  await startSession(res, reset.userId);
  res.json({ ok: true });
});
