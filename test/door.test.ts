import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, buy, checkIn, createPublishedEvent, doorToken, organizer, paidTickets } from "./helpers.js";

describe("app de puerta", () => {
  it("valida una entrada paga una sola vez", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const token = await doorToken(agent, eventId);
    const [code] = await paidTickets(ticketTypeId);

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
    const token = await doorToken(agent, eventId);
    const order = (await buy(ticketTypeId, 1)).body;
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    expect((await checkIn(token, ticket.code)).status).toBe(409);
    expect((await checkIn(token, "no-existe")).status).toBe(404);
  });

  it("exige un link de puerta válido", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const [code] = await paidTickets(ticketTypeId);
    expect((await checkIn(undefined, code)).status).toBe(401);
    expect((await checkIn("cualquiera", code)).status).toBe(401);
  });

  it("no valida entradas de otro evento", async () => {
    const a = await createPublishedEvent();
    const b = await createPublishedEvent();
    const tokenA = await doorToken(a.agent, a.eventId);
    const [codeB] = await paidTickets(b.ticketTypeId);
    const res = await checkIn(tokenA, codeB);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Esta entrada es de otro evento");
  });

  it("al regenerar el link, el anterior deja de funcionar", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const oldToken = await doorToken(agent, eventId);
    const newToken = await doorToken(agent, eventId);
    const [code] = await paidTickets(ticketTypeId);
    expect((await checkIn(oldToken, code)).status).toBe(401);
    expect((await checkIn(newToken, code)).status).toBe(200);
  });

  it("solo el organizador dueño genera el link", async () => {
    const { eventId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await other.post(`/organizer/events/${eventId}/door-token`)).status).toBe(404);
  });

  it("el link de puerta no aparece en la lista de eventos del panel", async () => {
    const { agent, eventId } = await createPublishedEvent();
    await doorToken(agent, eventId);
    const list = await agent.get("/organizer/events");
    expect(list.body[0].doorToken).toBeUndefined();
  });

  it("muestra el evento y el contador de ingresos", async () => {
    const { agent, eventId } = await createPublishedEvent();
    const token = await doorToken(agent, eventId);
    const res = await request(app).get("/door/event").set("x-door-token", token);
    expect(res.body).toMatchObject({ name: "Recital de prueba", stats: { paid: 0, checkedIn: 0 } });
  });

  it("valida un código tipeado en minúsculas y sin guiones", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const token = await doorToken(agent, eventId);
    const [code] = await paidTickets(ticketTypeId);
    expect((await checkIn(token, code.toLowerCase().replaceAll("-", " "))).status).toBe(200);
  });

  it("sigue aceptando entradas con el formato de código anterior", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent();
    const token = await doorToken(agent, eventId);
    const [code] = await paidTickets(ticketTypeId);
    await prisma.ticket.update({ where: { code }, data: { code: "Ewza6jhriwxN" } });
    expect((await checkIn(token, "Ewza6jhriwxN")).status).toBe(200);
  });
});

describe("QR de las entradas", () => {
  it("genera el QR de una entrada paga", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const [code] = await paidTickets(ticketTypeId);
    const res = await request(app).get(`/tickets/${code}/qr.svg`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
  });

  it("no genera QR de entradas sin pagar", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    const ticket = await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } });
    expect((await request(app).get(`/tickets/${ticket.code}/qr.svg`)).status).toBe(404);
  });
});
