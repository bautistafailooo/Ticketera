import { Router } from "express";
import { z } from "zod";
import {
  SESSION_COOKIE,
  currentUser,
  hashPassword,
  readSessionToken,
  startSession,
  verifyPassword,
} from "../auth.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1),
});

const publicUser = (user: { id: string; name: string; email: string }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

authRouter.post("/register", async (req, res) => {
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

authRouter.post("/login", async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
