import type { ErrorRequestHandler } from "express";
import { z, ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";

z.config(z.locales.es());

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const FIELD_NAMES: Record<string, string> = {
  name: "Nombre",
  email: "Email",
  password: "Contraseña",
  buyerName: "Nombre",
  buyerEmail: "Email",
  venue: "Lugar",
  startsAt: "Fecha",
  description: "Descripción",
  priceCents: "Precio",
  capacity: "Cantidad",
  items: "Entradas",
  quantity: "Cantidad",
  code: "Código",
};

function describeIssue(issue: z.core.$ZodIssue) {
  const field = issue.path.map(String).find((key) => FIELD_NAMES[key]);
  return field ? `${FIELD_NAMES[field]}: ${issue.message}` : issue.message;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: describeIssue(err.issues[0]), details: err.issues });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.details });
    return;
  }
  // Errores de express.json / express.raw (JSON mal formado, cuerpo demasiado grande).
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500 && err.expose) {
    const message = err.status === 413 ? "El archivo es demasiado grande (máximo 5 MB)" : "Pedido inválido";
    res.status(err.status).json({ error: message });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({ error: "Ya existe un registro con esos datos" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno" });
};
