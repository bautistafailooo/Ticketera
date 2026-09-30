import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();

async function organizer(email = "org@example.com") {
  const agent = request.agent(app);
  const res = await agent
    .post("/auth/register")
    .send({ name: "Org", email, password: "secreta123" });
  expect(res.status).toBe(201);
  return agent;
}

async function createPublishedEvent(capacity = 2) {
  const agent = await organizer(`org-${Math.random()}@example.com`);
  const event = await agent.post("/organizer/events").send({
    name: "Recital de prueba",
    venue: "Estadio",
    startsAt: "2026-12-01T21:00:00.000Z",
  });
  const ticketType = await agent
    .post(`/organizer/events/${event.body.id}/ticket-types`)
    .send({ name: "Campo", priceCents: 1500000, capacity });
  await agent.post(`/organizer/events/${event.body.id}/publish`);
  return { agent, eventId: event.body.id as string, ticketTypeId: ticketType.body.id as string };
}

function buy(ticketTypeId: string, quantity: number) {
  return request(app)
    .post("/orders")
    .send({
      buyerName: "Ana",
      buyerEmail: "ana@example.com",
      items: [{ ticketTypeId, quantity }],
    });
}

beforeEach(async () => {
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.event.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
});

describe("cuentas de organizador", () => {
  it("registra, consulta la sesión y cierra sesión", async () => {
    const agent = await organizer();
    expect((await agent.get("/auth/me")).body.email).toBe("org@example.com");
    await agent.post("/auth/logout");
    expect((await agent.get("/auth/me")).status).toBe(401);
  });

  it("inicia sesión solo con la contraseña correcta", async () => {
    await organizer();
    const wrong = await request(app)
      .post("/auth/login")
      .send({ email: "org@example.com", password: "incorrecta" });
    expect(wrong.status).toBe(401);
    const ok = await request(app)
      .post("/auth/login")
      .send({ email: "ORG@example.com", password: "secreta123" });
    expect(ok.status).toBe(200);
    expect(ok.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("no permite registrar dos veces el mismo email", async () => {
    await organizer();
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Otro", email: "org@example.com", password: "secreta123" });
    expect(res.status).toBe(409);
  });

  it("no guarda la contraseña en texto plano", async () => {
    await organizer();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "org@example.com" } });
    expect(user.passwordHash).not.toContain("secreta123");
  });
});

describe("panel del organizador", () => {
  it("exige iniciar sesión", async () => {
    const res = await request(app).post("/organizer/events").send({
      name: "Sin login",
      venue: "Club",
      startsAt: "2026-12-01T21:00:00.000Z",
    });
    expect(res.status).toBe(401);
  });

  it("no deja ver ni modificar eventos de otro organizador", async () => {
    const { eventId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await other.get(`/organizer/events/${eventId}`)).status).toBe(404);
    const res = await other
      .post(`/organizer/events/${eventId}/ticket-types`)
      .send({ name: "Pirata", priceCents: 1, capacity: 1 });
    expect(res.status).toBe(404);
    expect((await other.get("/organizer/events")).body).toEqual([]);
  });

  it("no publica un evento sin tipos de entrada", async () => {
    const agent = await organizer();
    const event = await agent.post("/organizer/events").send({
      name: "Vacío",
      venue: "Club",
      startsAt: "2026-12-01T21:00:00.000Z",
    });
    const res = await agent.post(`/organizer/events/${event.body.id}/publish`);
    expect(res.status).toBe(409);
  });

  it("valida los datos de entrada", async () => {
    const agent = await organizer();
    const res = await agent.post("/organizer/events").send({ name: "" });
    expect(res.status).toBe(400);
  });

  it("muestra ventas y recaudación contando solo órdenes pagas", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10);
    const paid = await buy(ticketTypeId, 2);
    await request(app).post(`/orders/${paid.body.id}/pay`);
    await buy(ticketTypeId, 1); // queda pendiente

    const res = await agent.get(`/organizer/events/${eventId}`);
    expect(res.body.totals).toMatchObject({ capacity: 10, sold: 3, paid: 2, revenueCents: 3000000 });
    expect(res.body.orders).toHaveLength(2);
  });
});

describe("cartelera pública", () => {
  it("lista solo los eventos publicados", async () => {
    await createPublishedEvent();
    const agent = await organizer();
    const draft = await agent.post("/organizer/events").send({
      name: "Borrador",
      venue: "Club",
      startsAt: "2026-12-01T21:00:00.000Z",
    });
    const res = await request(app).get("/events");
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Recital de prueba"]);
    expect((await request(app).get(`/events/${draft.body.id}`)).status).toBe(404);
  });
});

describe("compras", () => {
  it("crea una orden con una entrada por unidad y calcula el total", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const res = await buy(ticketTypeId, 2);
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(3000000);
    expect(res.body.status).toBe("PENDING");
    expect(res.body.tickets).toHaveLength(2);
  });

  it("no vende más entradas que la capacidad", async () => {
    const { ticketTypeId } = await createPublishedEvent(2);
    expect((await buy(ticketTypeId, 2)).status).toBe(201);
    expect((await buy(ticketTypeId, 1)).status).toBe(409);
  });

  it("no sobrevende con compras simultáneas", async () => {
    const { ticketTypeId } = await createPublishedEvent(3);
    const results = await Promise.all(Array.from({ length: 6 }, () => buy(ticketTypeId, 1)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.sold).toBe(3);
  });
});

describe("app de puerta", () => {
  async function doorFor(agent: ReturnType<typeof request.agent>, eventId: string) {
    const res = await agent.post(`/organizer/events/${eventId}/door-token`);
    expect(res.status).toBe(200);
    return res.body.doorToken as string;
  }

  function checkIn(token: string | undefined, code: string) {
    const req = request(app).post("/door/check-in").send({ code });
    return token ? req.set("x-door-token", token) : req;
  }

  async function paidTicket(ticketTypeId: string) {
    const order = await buy(ticketTypeId, 1);
    await request(app).post(`/orders/${order.body.id}/pay`);
    return order.body.tickets[0].code as string;
  }

  it("valida una entrada paga una sola vez", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const token = await doorFor(agent, eventId);
    const code = await paidTicket(ticketTypeId);

    const first = await checkIn(token, code);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ ticketType: "Campo", buyerName: "Ana", stats: { paid: 1, checkedIn: 1 } });

    const second = await checkIn(token, code);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("La entrada ya fue usada");
    expect(second.body.usedAt).toBeTruthy();
  });

  it("rechaza entradas sin pagar e inexistentes", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const token = await doorFor(agent, eventId);
    const order = await buy(ticketTypeId, 1);
    expect((await checkIn(token, order.body.tickets[0].code)).status).toBe(409);
    expect((await checkIn(token, "no-existe")).status).toBe(404);
  });

  it("exige un link de puerta válido", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const code = await paidTicket(ticketTypeId);
    expect((await checkIn(undefined, code)).status).toBe(401);
    expect((await checkIn("cualquiera", code)).status).toBe(401);
  });

  it("no valida entradas de otro evento", async () => {
    const a = await createPublishedEvent();
    const b = await createPublishedEvent();
    const tokenA = await doorFor(a.agent, a.eventId);
    const codeB = await paidTicket(b.ticketTypeId);
    const res = await checkIn(tokenA, codeB);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Esta entrada es de otro evento");
  });

  it("al regenerar el link, el anterior deja de funcionar", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const oldToken = await doorFor(agent, eventId);
    const newToken = await doorFor(agent, eventId);
    const code = await paidTicket(ticketTypeId);
    expect((await checkIn(oldToken, code)).status).toBe(401);
    expect((await checkIn(newToken, code)).status).toBe(200);
  });

  it("solo el organizador dueño genera el link", async () => {
    const { eventId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await other.post(`/organizer/events/${eventId}/door-token`)).status).toBe(404);
  });

  it("muestra el evento y el contador de ingresos", async () => {
    const { agent, eventId } = await createPublishedEvent();
    const token = await doorFor(agent, eventId);
    const res = await request(app).get("/door/event").set("x-door-token", token);
    expect(res.body).toMatchObject({ name: "Recital de prueba", stats: { paid: 0, checkedIn: 0 } });
  });
});

describe("frontend", () => {
  it("sirve el decodificador de QR", async () => {
    const res = await request(app).get("/vendor/jsQR.js");
    expect(res.status).toBe(200);
  });

  it("sirve la cartelera", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Próximos eventos");
  });

  it("genera el QR de una entrada", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = await buy(ticketTypeId, 1);
    const res = await request(app).get(`/tickets/${order.body.tickets[0].code}/qr.svg`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });
});
