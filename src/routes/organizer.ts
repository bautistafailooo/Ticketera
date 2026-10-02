import { randomBytes, timingSafeEqual } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { readCookie, requireUser, userOf } from "../auth.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { Prisma } from "../../generated/prisma/client.js";
import { canEdit, isTrusted, visibility } from "../events.js";
import { MAX_IMAGE_BYTES, deleteImage, detectImageType, saveImage } from "../images.js";
import { notifyAdminsPendingReview, sendOrderConfirmation } from "../mail/messages.js";
import { sendInBackground } from "../mail/transport.js";
import { withLots } from "../lots.js";
import { expireOrders } from "../orders.js";
import { rateLimits } from "../security.js";
import { generateTicketCode } from "../ticket-code.js";
import { authorizationUrl, connectAccount, disconnectAccount, oauthRedirectUri } from "../payments/mercadopago.js";

// Rutas del panel del organizador: requieren sesión y solo acceden a sus eventos.
export const organizerRouter = Router();
organizerRouter.use(requireUser);

const inTheFuture = (date: Date) => date.getTime() > Date.now();

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  venue: z.string().trim().min(1).max(200),
  // Vacía = sin mapa.
  address: z
    .string()
    .trim()
    .max(200)
    .transform((value) => value || null)
    .optional(),
  startsAt: z.coerce.date().refine(inTheFuture, "Tiene que ser una fecha futura"),
});

const updateEventSchema = createEventSchema.partial();

const createTicketTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // Hasta $100.000.000 por entrada.
  priceCents: z.number().int().nonnegative().max(10_000_000_000),
  capacity: z.number().int().positive().max(1_000_000),
  // Lotes (opcionales): venta hasta una fecha y/o habilitarse cuando termina otro tipo.
  salesEndAt: z.coerce.date().refine(inTheFuture, "Tiene que ser una fecha futura").optional(),
  opensAfterId: z.string().min(1).max(50).optional(),
});

async function findOwnEvent(eventId: string, organizerId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizerId },
    include: { ticketTypes: { orderBy: { priceCents: "asc" } } },
  });
  if (!event) throw new HttpError(404, "Evento no encontrado");
  return event;
}

// Entradas pagas, cortesías, recaudación y entradas validadas por tipo de entrada.
async function ticketStats(ticketTypeIds: string[]) {
  const [paid, courtesy, checkedIn] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, order: { status: "PAID", complimentary: false } },
      _count: true,
      _sum: { priceCents: true },
    }),
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, order: { status: "PAID", complimentary: true } },
      _count: true,
    }),
    prisma.ticket.groupBy({
      by: ["ticketTypeId"],
      where: { ticketTypeId: { in: ticketTypeIds }, usedAt: { not: null } },
      _count: true,
    }),
  ]);
  return {
    paid: new Map(paid.map((r) => [r.ticketTypeId, { count: r._count, revenueCents: r._sum.priceCents ?? 0 }])),
    courtesy: new Map(courtesy.map((r) => [r.ticketTypeId, r._count])),
    checkedIn: new Map(checkedIn.map((r) => [r.ticketTypeId, r._count])),
  };
}

type TicketTypeRow = {
  id: string;
  name: string;
  priceCents: number;
  capacity: number;
  sold: number;
  salesEndAt: Date | null;
  opensAfterId: string | null;
};

function withStats(ticketTypes: TicketTypeRow[], stats: Awaited<ReturnType<typeof ticketStats>>) {
  const rows = withLots(ticketTypes).map((t) => {
    const paid = stats.paid.get(t.id);
    return {
      ...t,
      paid: paid?.count ?? 0,
      courtesy: stats.courtesy.get(t.id) ?? 0,
      checkedIn: stats.checkedIn.get(t.id) ?? 0,
      // Se suma el precio de cada entrada al momento de la compra.
      revenueCents: paid?.revenueCents ?? 0,
    };
  });
  const sum = (key: "capacity" | "sold" | "paid" | "courtesy" | "checkedIn" | "revenueCents") =>
    rows.reduce((total, t) => total + t[key], 0);
  const totals = {
    capacity: sum("capacity"),
    sold: sum("sold"),
    paid: sum("paid"),
    courtesy: sum("courtesy"),
    checkedIn: sum("checkedIn"),
    revenueCents: sum("revenueCents"),
  };
  return { ticketTypes: rows, totals };
}

organizerRouter.get("/events", async (_req, res) => {
  await expireOrders();
  const events = await prisma.event.findMany({
    where: { organizerId: userOf(res).id },
    orderBy: { startsAt: "asc" },
    include: { ticketTypes: true },
  });
  const user = userOf(res);
  const stats = await ticketStats(events.flatMap((e) => e.ticketTypes.map((t) => t.id)));
  res.json(
    events.map(({ doorToken: _doorToken, ...event }) => ({
      ...event,
      ...withStats(event.ticketTypes, stats),
      visibility: visibility(event, user),
    })),
  );
});

organizerRouter.post("/events", async (req, res) => {
  const data = createEventSchema.parse(req.body);
  const event = await prisma.event.create({
    data: { ...data, organizerId: userOf(res).id },
  });
  res.status(201).json(event);
});

organizerRouter.get("/events/:id", async (req, res) => {
  await expireOrders();
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  const stats = await ticketStats(event.ticketTypes.map((t) => t.id));
  const orders = await prisma.order.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      buyerName: true,
      buyerEmail: true,
      status: true,
      totalCents: true,
      complimentary: true,
      refundedAt: true,
      createdAt: true,
      _count: { select: { tickets: true } },
    },
  });
  const user = userOf(res);
  res.json({
    ...event,
    ...withStats(event.ticketTypes, stats),
    orders,
    visibility: visibility(event, user),
    editable: canEdit(event, user),
  });
});

function assertEditable(event: Parameters<typeof canEdit>[0], user: Parameters<typeof canEdit>[1]) {
  if (!canEdit(event, user)) {
    throw new HttpError(
      409,
      event.status === "PENDING_REVIEW"
        ? "El evento está en revisión: esperá la respuesta antes de modificarlo"
        : "Este evento ya no se puede modificar",
    );
  }
}

organizerRouter.patch("/events/:id", async (req, res) => {
  const data = updateEventSchema.parse(req.body);
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  assertEditable(event, user);
  // Se actualiza solo si el estado no cambió mientras tanto (por ejemplo, una revisión).
  const updated = await prisma.event.updateMany({
    where: { id: event.id, status: event.status },
    data,
  });
  if (updated.count === 0) throw new HttpError(409, "El evento cambió de estado. Recargá la página.");
  res.json(await prisma.event.findUniqueOrThrow({ where: { id: event.id } }));
});

organizerRouter.post("/events/:id/ticket-types", async (req, res) => {
  const data = createTicketTypeSchema.parse(req.body);
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  assertEditable(event, user);
  if (event.ticketTypes.some((t) => t.name.toLowerCase() === data.name.toLowerCase())) {
    throw new HttpError(409, "Ya existe un tipo de entrada con ese nombre");
  }
  if (data.opensAfterId && !event.ticketTypes.some((t) => t.id === data.opensAfterId)) {
    throw new HttpError(400, "El lote anterior tiene que ser un tipo de entrada de este evento");
  }
  if (data.salesEndAt && data.salesEndAt > event.startsAt) {
    throw new HttpError(400, "La venta de un lote no puede terminar después del evento");
  }
  const ticketType = await prisma.ticketType.create({
    data: { ...data, eventId: event.id },
  });
  res.status(201).json(ticketType);
});

// Editar un tipo de entrada. El precio nuevo vale para las compras que vienen (cada entrada
// guarda el precio con el que se compró) y el cupo no puede quedar por debajo de lo vendido.
const updateTicketTypeSchema = z.object({
  name: createTicketTypeSchema.shape.name.optional(),
  priceCents: createTicketTypeSchema.shape.priceCents.optional(),
  capacity: createTicketTypeSchema.shape.capacity.optional(),
  // null = sacar la fecha de fin o el lote anterior.
  salesEndAt: z.coerce.date().refine(inTheFuture, "Tiene que ser una fecha futura").nullable().optional(),
  opensAfterId: z.string().min(1).max(50).nullable().optional(),
});

async function findOwnTicketType(req: { params: Record<string, string | string[]> }, user: ReturnType<typeof userOf>) {
  const event = await findOwnEvent(String(req.params.id), user.id);
  assertEditable(event, user);
  const type = event.ticketTypes.find((t) => t.id === String(req.params.typeId));
  if (!type) throw new HttpError(404, "Tipo de entrada no encontrado");
  return { event, type };
}

organizerRouter.patch("/events/:id/ticket-types/:typeId", async (req, res) => {
  const data = updateTicketTypeSchema.parse(req.body);
  const user = userOf(res);
  const { event, type } = await findOwnTicketType(req, user);

  if (data.name && event.ticketTypes.some((t) => t.id !== type.id && t.name.toLowerCase() === data.name!.toLowerCase())) {
    throw new HttpError(409, "Ya existe un tipo de entrada con ese nombre");
  }
  if (data.salesEndAt && data.salesEndAt > event.startsAt) {
    throw new HttpError(400, "La venta de un lote no puede terminar después del evento");
  }
  if (data.opensAfterId) {
    if (data.opensAfterId === type.id || !event.ticketTypes.some((t) => t.id === data.opensAfterId)) {
      throw new HttpError(400, "El lote anterior tiene que ser otro tipo de entrada de este evento");
    }
    // Sin círculos: el lote anterior no puede depender (directa o indirectamente) de este.
    let current: string | null = data.opensAfterId;
    for (let i = 0; current && i <= event.ticketTypes.length; i++) {
      if (current === type.id) throw new HttpError(400, "Esa combinación de lotes se habilitaría en círculo");
      current = event.ticketTypes.find((t) => t.id === current)?.opensAfterId ?? null;
    }
  }

  // El cupo se cambia solo si no queda por debajo de lo vendido o reservado en ese momento.
  const updated = await prisma.ticketType.updateMany({
    where: { id: type.id, ...(data.capacity !== undefined ? { sold: { lte: data.capacity } } : {}) },
    data,
  });
  if (updated.count === 0) {
    const { sold } = await prisma.ticketType.findUniqueOrThrow({ where: { id: type.id } });
    throw new HttpError(409, `Ya hay ${sold} entradas vendidas o reservadas: el cupo no puede ser menor`);
  }
  res.json(await prisma.ticketType.findUniqueOrThrow({ where: { id: type.id } }));
});

// Borrar un tipo de entrada: solo si todavía no tiene ninguna entrada (ni reservada). Si ya vendió,
// la venta se corta con "venta hasta" o bajando el cupo, para no perder el historial.
organizerRouter.delete("/events/:id/ticket-types/:typeId", async (req, res) => {
  const user = userOf(res);
  const { event, type } = await findOwnTicketType(req, user);
  if (await prisma.ticket.count({ where: { ticketTypeId: type.id } })) {
    throw new HttpError(409, "Este tipo ya tiene entradas: no se puede borrar. Para cortar la venta, poné \"venta hasta\" o bajá el cupo.");
  }
  if (event.status !== "DRAFT" && event.status !== "REJECTED" && event.ticketTypes.length === 1) {
    throw new HttpError(409, "El evento necesita al menos un tipo de entrada");
  }
  try {
    await prisma.ticketType.delete({ where: { id: type.id } });
  } catch (err) {
    // Alguien compró justo en ese momento: ya tiene entradas.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      throw new HttpError(409, "Este tipo ya tiene entradas: no se puede borrar.");
    }
    throw err;
  }
  res.json({ ok: true });
});

// Sube o reemplaza el flyer. El cuerpo del pedido es la imagen (JPG, PNG o WebP).
organizerRouter.put(
  "/events/:id/image",
  express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const user = userOf(res);
    const event = await findOwnEvent(String(req.params.id), user.id);
    assertEditable(event, user);
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const type = detectImageType(data);
    if (!type) throw new HttpError(400, "La imagen tiene que ser JPG, PNG o WebP");

    const file = await saveImage(data, type);
    const updated = await prisma.event.updateMany({
      where: { id: event.id, status: event.status },
      data: { imageFile: file },
    });
    if (updated.count === 0) {
      await deleteImage(file);
      throw new HttpError(409, "El evento cambió de estado. Recargá la página.");
    }
    await deleteImage(event.imageFile);
    res.json({ imageFile: file });
  },
);

organizerRouter.delete("/events/:id/image", async (req, res) => {
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  assertEditable(event, user);
  await prisma.event.update({ where: { id: event.id }, data: { imageFile: null } });
  await deleteImage(event.imageFile);
  res.json({ ok: true });
});

// Publica el evento (organizador confiable) o lo envía a revisión (no confiable).
organizerRouter.post("/events/:id/publish", async (req, res) => {
  const user = userOf(res);
  const event = await findOwnEvent(req.params.id, user.id);
  if (user.suspendedAt) throw new HttpError(403, "Tu cuenta está suspendida");
  if (!user.emailVerifiedAt) throw new HttpError(403, "Confirmá tu email para poder publicar (te mandamos un link)");
  if (event.status !== "DRAFT" && event.status !== "REJECTED") {
    throw new HttpError(409, "El evento ya fue publicado o enviado a revisión");
  }
  if (event.ticketTypes.length === 0) {
    throw new HttpError(409, "El evento necesita al menos un tipo de entrada");
  }
  if (!inTheFuture(event.startsAt)) throw new HttpError(409, "La fecha del evento ya pasó");
  const paid = event.ticketTypes.some((t) => t.priceCents > 0);
  if (paid && !config.simulatedPayments && !(config.mercadoPago && user.mpAccessToken)) {
    throw new HttpError(409, "Para vender entradas pagas, conectá tu cuenta de Mercado Pago desde el panel");
  }

  const status = isTrusted(user) ? "PUBLISHED" : "PENDING_REVIEW";
  const updated = await prisma.event.updateMany({
    where: { id: event.id, status: event.status },
    data: { status },
  });
  if (updated.count === 0) throw new HttpError(409, "El evento cambió de estado. Recargá la página.");
  if (status === "PENDING_REVIEW") {
    sendInBackground("evento para revisar", () => notifyAdminsPendingReview(event.id));
  }
  res.json({ status });
});

// Genera (o regenera) el link de puerta del evento. El link anterior deja de funcionar.
organizerRouter.post("/events/:id/door-token", async (req, res) => {
  const event = await findOwnEvent(req.params.id, userOf(res).id);
  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { doorToken: randomBytes(24).toString("base64url") },
  });
  res.json({ doorToken: updated.doorToken });
});

// ---------- Cuenta de Mercado Pago del organizador ----------
// Las ventas de sus eventos se cobran en su cuenta; el cargo por servicio le llega a ecko.

const MP_STATE_COOKIE = "ecko_mp_state";

organizerRouter.get("/mercadopago", (_req, res) => {
  const user = userOf(res);
  res.json({
    available: config.mercadoPago !== null,
    // Sin pago simulado, hace falta para publicar eventos con entradas pagas.
    required: !config.simulatedPayments,
    connected: user.mpAccessToken !== null,
    connectedAt: user.mpConnectedAt,
    redirectUri: config.mercadoPago ? oauthRedirectUri() : null,
  });
});

// Lleva al organizador a Mercado Pago para que autorice a ecko a cobrar en su nombre.
organizerRouter.get("/mercadopago/connect", (_req, res) => {
  if (!config.mercadoPago) throw new HttpError(503, "Mercado Pago no está configurado");
  if (!userOf(res).emailVerifiedAt) {
    res.redirect("/panel.html?mp=verificar");
    return;
  }
  // "state": un valor al azar que tiene que volver igual, para que nadie pueda conectar
  // su propia cuenta en el panel de otro organizador con un link armado.
  const state = randomBytes(24).toString("base64url");
  res.cookie(MP_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    maxAge: 15 * 60 * 1000,
    path: "/organizer/mercadopago",
  });
  res.redirect(authorizationUrl(state));
});

organizerRouter.get("/mercadopago/callback", async (req, res) => {
  const expected = readCookie(req, MP_STATE_COOKIE) ?? "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  res.clearCookie(MP_STATE_COOKIE, { path: "/organizer/mercadopago" });
  const sameState =
    expected.length > 0 && expected.length === state.length && timingSafeEqual(Buffer.from(expected), Buffer.from(state));
  if (!sameState || !code) {
    res.redirect("/panel.html?mp=error");
    return;
  }
  try {
    await connectAccount(userOf(res).id, code);
  } catch (err) {
    console.error("No se pudo conectar la cuenta de Mercado Pago", err);
    res.redirect("/panel.html?mp=error");
    return;
  }
  res.redirect("/panel.html?mp=ok");
});

organizerRouter.post("/mercadopago/disconnect", async (_req, res) => {
  await disconnectAccount(userOf(res).id);
  res.json({ ok: true });
});

// --- Cortesías ---
// Entradas gratis para invitados: ocupan lugar como cualquier entrada y le llegan por mail al invitado.

const courtesySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.email().max(200),
  ticketTypeId: z.string().min(1).max(50),
  quantity: z.number().int().min(1).max(10),
});

organizerRouter.post("/events/:id/cortesias", rateLimits.courtesies, async (req, res) => {
  const data = courtesySchema.parse(req.body);
  const user = userOf(res);
  const event = await findOwnEvent(String(req.params.id), user.id);
  if (user.suspendedAt) throw new HttpError(403, "Tu cuenta está suspendida");
  if (!user.emailVerifiedAt) throw new HttpError(403, "Confirmá tu email para poder mandar cortesías");
  if (event.status === "CANCELLED" || !inTheFuture(event.startsAt)) {
    throw new HttpError(409, "No se pueden mandar cortesías para este evento");
  }
  const type = event.ticketTypes.find((t) => t.id === data.ticketTypeId);
  if (!type) throw new HttpError(400, "Elegí un tipo de entrada de este evento");

  const order = await prisma.$transaction(async (tx) => {
    // Ocupan lugar: misma reserva atómica que una compra (sin importar el lote ni el precio).
    const reserved = await tx.ticketType.updateMany({
      where: { id: type.id, sold: { lte: type.capacity - data.quantity } },
      data: { sold: { increment: data.quantity } },
    });
    if (reserved.count === 0) throw new HttpError(409, `No quedan suficientes lugares en "${type.name}"`);
    return tx.order.create({
      data: {
        eventId: event.id,
        accessToken: randomBytes(24).toString("base64url"),
        buyerName: data.name,
        buyerEmail: data.email,
        status: "PAID",
        complimentary: true,
        totalCents: 0,
        paidAt: new Date(),
        tickets: {
          create: Array.from({ length: data.quantity }, () => ({ ticketTypeId: type.id, code: generateTicketCode(), priceCents: 0 })),
        },
      },
    });
  });
  sendInBackground("cortesía", () => sendOrderConfirmation(order.id));
  res.status(201).json({ id: order.id, quantity: data.quantity, email: data.email });
});

// --- Perfil público ---

// Instagram: se acepta "@usuario", "usuario" o el link al perfil; se guarda solo el usuario.
const instagramSchema = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, ""))
  .refine((value) => value === "" || /^[A-Za-z0-9._]{1,30}$/.test(value), "Usuario de Instagram inválido");

// Sitio web: solo http o https (nada de "javascript:" ni otros esquemas).
const websiteSchema = z
  .string()
  .trim()
  .max(200)
  .transform((value) => (value && !/^https?:\/\//i.test(value) ? `https://${value}` : value))
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Sitio web inválido");

const profileSchema = z.object({
  bio: z.string().trim().max(500).optional(),
  instagram: instagramSchema.optional(),
  website: websiteSchema.optional(),
});

const profileOf = (user: { id: string; name: string; bio: string | null; instagram: string | null; website: string | null }) => ({
  id: user.id,
  name: user.name,
  bio: user.bio,
  instagram: user.instagram,
  website: user.website,
});

organizerRouter.get("/profile", (_req, res) => {
  res.json(profileOf(userOf(res)));
});

organizerRouter.patch("/profile", async (req, res) => {
  const data = profileSchema.parse(req.body);
  // Un campo vacío se borra.
  const clean = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === "" ? null : value]));
  const user = await prisma.user.update({ where: { id: userOf(res).id }, data: clean });
  res.json(profileOf(user));
});
