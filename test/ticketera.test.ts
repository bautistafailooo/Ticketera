import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();

async function createPublishedEvent(capacity = 2) {
  const event = await request(app).post("/events").send({
    name: "Recital de prueba",
    venue: "Estadio",
    startsAt: "2026-12-01T21:00:00.000Z",
  });
  const ticketType = await request(app)
    .post(`/events/${event.body.id}/ticket-types`)
    .send({ name: "Campo", priceCents: 1500000, capacity });
  await request(app).post(`/events/${event.body.id}/publish`);
  return { eventId: event.body.id as string, ticketTypeId: ticketType.body.id as string };
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
});

describe("eventos", () => {
  it("no publica un evento sin tipos de entrada", async () => {
    const event = await request(app).post("/events").send({
      name: "Vacío",
      venue: "Club",
      startsAt: "2026-12-01T21:00:00.000Z",
    });
    const res = await request(app).post(`/events/${event.body.id}/publish`);
    expect(res.status).toBe(409);
  });

  it("lista solo los eventos publicados", async () => {
    await createPublishedEvent();
    await request(app).post("/events").send({
      name: "Borrador",
      venue: "Club",
      startsAt: "2026-12-01T21:00:00.000Z",
    });
    const res = await request(app).get("/events");
    expect(res.body.map((e: { name: string }) => e.name)).toEqual(["Recital de prueba"]);
  });

  it("valida los datos de entrada", async () => {
    const res = await request(app).post("/events").send({ name: "" });
    expect(res.status).toBe(400);
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

describe("control de acceso", () => {
  it("valida una entrada paga una sola vez", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = await buy(ticketTypeId, 1);
    const code = order.body.tickets[0].code;

    expect((await request(app).post(`/tickets/${code}/check-in`)).status).toBe(409);

    await request(app).post(`/orders/${order.body.id}/pay`);
    const first = await request(app).post(`/tickets/${code}/check-in`);
    expect(first.status).toBe(200);
    expect(first.body.event).toBe("Recital de prueba");

    const second = await request(app).post(`/tickets/${code}/check-in`);
    expect(second.status).toBe(409);
  });

  it("rechaza códigos inexistentes", async () => {
    const res = await request(app).post("/tickets/no-existe/check-in");
    expect(res.status).toBe(404);
  });
});
