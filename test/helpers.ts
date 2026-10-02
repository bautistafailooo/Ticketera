import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";

export const app = createApp();

export const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

// Organizador logueado. Por defecto confiable (publica sin revisión) para simplificar los tests.
export async function organizer(email = "org@example.com", { trusted = true, verified = true } = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/register").send({ name: "Org", email, password: "secreta123" });
  expect(res.status).toBe(201);
  // Al registrarse se manda el mail para confirmar el email: se da por confirmado y se descarta.
  await expect.poll(() => sentMails.some((m) => m.to === email)).toBe(true);
  sentMails.splice(sentMails.findIndex((m) => m.to === email), 1);
  if (verified) await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  if (trusted) {
    await prisma.user.update({ where: { email }, data: { trustedAt: new Date() } });
  }
  return agent;
}

// Crea un evento en borrador con un tipo de entrada, listo para publicar o enviar a revisión.
export async function draftEvent(agent: ReturnType<typeof request.agent>, name = "Recital de prueba") {
  const event = await agent.post("/organizer/events").send({ name, venue: "Estadio", startsAt: inDays(30) });
  expect(event.status).toBe(201);
  const ticketType = await agent
    .post(`/organizer/events/${event.body.id}/ticket-types`)
    .send({ name: "Campo", priceCents: 1000, capacity: 10 });
  expect(ticketType.status).toBe(201);
  return { eventId: event.body.id as string, ticketTypeId: ticketType.body.id as string };
}

export async function admin(email = "admin@example.com") {
  const agent = await organizer(email);
  await prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
  return agent;
}

export async function createPublishedEvent(capacity = 2, priceCents = 1500000) {
  const agent = await organizer(`org-${Math.random()}@example.com`);
  const event = await agent.post("/organizer/events").send({
    name: "Recital de prueba",
    venue: "Estadio",
    startsAt: inDays(30),
  });
  expect(event.status).toBe(201);
  const ticketType = await agent
    .post(`/organizer/events/${event.body.id}/ticket-types`)
    .send({ name: "Campo", priceCents, capacity });
  const published = await agent.post(`/organizer/events/${event.body.id}/publish`);
  expect(published.status).toBe(200);
  return { agent, eventId: event.body.id as string, ticketTypeId: ticketType.body.id as string };
}

export function buy(ticketTypeId: string, quantity: number) {
  return request(app)
    .post("/orders")
    .send({ buyerName: "Ana", buyerEmail: "ana@example.com", items: [{ ticketTypeId, quantity }] });
}

export function getOrder(order: { id: string; accessToken: string }) {
  return request(app).get(`/orders/${order.id}`).set("x-order-token", order.accessToken);
}

export function pay(order: { id: string; accessToken: string }) {
  return request(app).post(`/orders/${order.id}/simulate-payment`).set("x-order-token", order.accessToken);
}

// Compra y paga: devuelve los códigos de las entradas.
export async function paidTickets(ticketTypeId: string, quantity = 1) {
  const order = (await buy(ticketTypeId, quantity)).body;
  expect((await pay(order)).status).toBe(200);
  const full = await getOrder(order);
  return full.body.tickets.map((t: { code: string }) => t.code) as string[];
}

export async function doorToken(agent: ReturnType<typeof request.agent>, eventId: string) {
  const res = await agent.post(`/organizer/events/${eventId}/door-token`);
  expect(res.status).toBe(200);
  return res.body.doorToken as string;
}

export function checkIn(token: string | undefined, code: string) {
  const req = request(app).post("/door/check-in").send({ code });
  return token ? req.set("x-door-token", token) : req;
}
