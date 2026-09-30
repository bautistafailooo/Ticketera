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
