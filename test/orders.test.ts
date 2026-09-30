import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { expireOrders } from "../src/orders.js";
import { app, buy, createPublishedEvent, getOrder, pay } from "./helpers.js";

describe("compras", () => {
  it("crea una orden pendiente con plazo de pago y calcula el total", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const res = await buy(ticketTypeId, 2);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "PENDING", totalCents: 3000000 });
    expect(res.body.accessToken).toBeTruthy();
    const minutes = (new Date(res.body.expiresAt).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(config.orderTtlMinutes - 1);
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

  it("limita la cantidad total de entradas por compra", async () => {
    const { ticketTypeId } = await createPublishedEvent(100);
    const res = await request(app)
      .post("/orders")
      .send({
        buyerName: "Ana",
        buyerEmail: "ana@example.com",
        items: [
          { ticketTypeId, quantity: 6 },
          { ticketTypeId, quantity: 6 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("no mezcla entradas de distintos eventos en una compra", async () => {
    const a = await createPublishedEvent();
    const b = await createPublishedEvent();
    const res = await request(app)
      .post("/orders")
      .send({
        buyerName: "Ana",
        buyerEmail: "ana@example.com",
        items: [
          { ticketTypeId: a.ticketTypeId, quantity: 1 },
          { ticketTypeId: b.ticketTypeId, quantity: 1 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("no vende entradas de eventos que ya empezaron", async () => {
    const { eventId, ticketTypeId } = await createPublishedEvent();
    await prisma.event.update({ where: { id: eventId }, data: { startsAt: new Date(Date.now() - 1000) } });
    const res = await buy(ticketTypeId, 1);
    expect(res.status).toBe(409);
  });

  it("las entradas gratis quedan confirmadas sin pago", async () => {
    const { ticketTypeId } = await createPublishedEvent(10, 0);
    const res = await buy(ticketTypeId, 1);
    expect(res.body.status).toBe("PAID");
    expect((await getOrder(res.body)).body.tickets[0].code).toBeTruthy();
  });
});

describe("acceso a las órdenes", () => {
  it("sin la clave de la orden no se puede ver ni pagar", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    expect((await request(app).get(`/orders/${order.id}`)).status).toBe(404);
    expect((await getOrder({ id: order.id, accessToken: "otra" })).status).toBe(404);
    expect((await pay({ id: order.id, accessToken: "otra" })).status).toBe(404);
    expect((await getOrder(order)).status).toBe(200);
  });

  it("los códigos de las entradas se entregan recién con la orden paga", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 2)).body;
    const pending = await getOrder(order);
    expect(pending.body.tickets.map((t: { code: string | null }) => t.code)).toEqual([null, null]);

    await pay(order);
    const paid = await getOrder(order);
    expect(paid.body.status).toBe("PAID");
    expect(paid.body.tickets[0].code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect(paid.body.event.name).toBe("Recital de prueba");
  });

  it("no se puede pagar dos veces", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    expect((await pay(order)).status).toBe(200);
    expect((await pay(order)).status).toBe(409);
  });

  it("el pago simulado no existe si está desactivado", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    config.simulatedPayments = false;
    try {
      expect((await pay(order)).status).toBe(404);
    } finally {
      config.simulatedPayments = true;
    }
  });
});

describe("vencimiento de órdenes", () => {
  async function expire(orderId: string) {
    await prisma.order.update({ where: { id: orderId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  }

  it("una orden impaga vence y libera el cupo", async () => {
    const { ticketTypeId } = await createPublishedEvent(2);
    const order = (await buy(ticketTypeId, 2)).body;
    expect((await buy(ticketTypeId, 1)).status).toBe(409);

    await expire(order.id);
    expect((await buy(ticketTypeId, 1)).status).toBe(201);

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.sold).toBe(1);
    expect((await getOrder(order)).body.status).toBe("EXPIRED");
  });

  it("no se puede pagar una orden vencida", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    await expire(order.id);
    expect((await pay(order)).status).toBe(409);
  });

  it("cada orden libera su cupo una sola vez aunque se venza en paralelo", async () => {
    const { ticketTypeId } = await createPublishedEvent(5);
    const order = (await buy(ticketTypeId, 3)).body;
    await expire(order.id);
    await Promise.all([expireOrders(), expireOrders(), expireOrders()]);
    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.sold).toBe(0);
  });

  it("no vence órdenes pagas", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    await pay(order);
    await expire(order.id);
    await expireOrders();
    expect((await getOrder(order)).body.status).toBe("PAID");
  });
});
