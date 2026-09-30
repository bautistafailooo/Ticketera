import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

export const app = createApp();

export const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

export async function organizer(email = "org@example.com", { approved = true } = {}) {
  const agent = request.agent(app);
  const res = await agent.post("/auth/register").send({ name: "Org", email, password: "secreta123" });
  expect(res.status).toBe(201);
  if (approved) {
    await prisma.user.update({ where: { email }, data: { approvedAt: new Date() } });
  }
  return agent;
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
