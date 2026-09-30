import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { admin, app, buy, createPublishedEvent, inDays, organizer, pay } from "./helpers.js";

describe("panel del organizador", () => {
  it("exige iniciar sesión", async () => {
    const res = await request(app).post("/organizer/events").send({ name: "Sin login", venue: "Club", startsAt: inDays(5) });
    expect(res.status).toBe(401);
  });

  it("no deja ver ni modificar eventos de otro organizador", async () => {
    const { eventId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await other.get(`/organizer/events/${eventId}`)).status).toBe(404);
    const res = await other.post(`/organizer/events/${eventId}/ticket-types`).send({ name: "Pirata", priceCents: 1, capacity: 1 });
    expect(res.status).toBe(404);
    expect((await other.get("/organizer/events")).body).toEqual([]);
  });


  it("no publica un evento sin tipos de entrada", async () => {
    const agent = await organizer();
    const event = await agent.post("/organizer/events").send({ name: "Vacío", venue: "Club", startsAt: inDays(5) });
    expect((await agent.post(`/organizer/events/${event.body.id}/publish`)).status).toBe(409);
  });

  it("no crea eventos en el pasado", async () => {
    const agent = await organizer();
    const res = await agent.post("/organizer/events").send({ name: "Viejo", venue: "Club", startsAt: inDays(-1) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Fecha: Tiene que ser una fecha futura");
  });

  it("valida los datos y sus largos máximos", async () => {
    const agent = await organizer();
    expect((await agent.post("/organizer/events").send({ name: "" })).status).toBe(400);
    const long = await agent.post("/organizer/events").send({ name: "x".repeat(500), venue: "Club", startsAt: inDays(5) });
    expect(long.status).toBe(400);
  });

  it("muestra ventas y recaudación contando solo órdenes pagas", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10);
    await pay((await buy(ticketTypeId, 2)).body);
    await buy(ticketTypeId, 1); // queda pendiente

    const res = await agent.get(`/organizer/events/${eventId}`);
    expect(res.body.totals).toMatchObject({ capacity: 10, sold: 3, paid: 2, revenueCents: 3000000 });
    expect(res.body.orders).toHaveLength(2);
  });

  it("la recaudación usa el precio al momento de la compra", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10);
    await pay((await buy(ticketTypeId, 1)).body);
    await prisma.ticketType.update({ where: { id: ticketTypeId }, data: { priceCents: 999 } });
    const res = await agent.get(`/organizer/events/${eventId}`);
    expect(res.body.totals.revenueCents).toBe(1500000);
  });
});

describe("cartelera pública", () => {
  it("lista solo eventos publicados, futuros y de organizadores aprobados", async () => {
    const { eventId } = await createPublishedEvent();
    const agent = await organizer("borrador@example.com");
    const draft = await agent.post("/organizer/events").send({ name: "Borrador", venue: "Club", startsAt: inDays(5) });
    const past = await createPublishedEvent();
    await prisma.event.update({ where: { id: past.eventId }, data: { name: "Pasado", startsAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get("/events");
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([eventId]);
    expect((await request(app).get(`/events/${draft.body.id}`)).status).toBe(404);
    expect((await request(app).get(`/events/${past.eventId}`)).status).toBe(404);
  });

  it("no expone datos internos del evento", async () => {
    const { agent, eventId } = await createPublishedEvent();
    await agent.post(`/organizer/events/${eventId}/door-token`);
    const res = await request(app).get(`/events/${eventId}`);
    expect(res.body.doorToken).toBeUndefined();
    expect(res.body.organizerId).toBeUndefined();
  });

  it("al suspender a un organizador, sus eventos salen de la cartelera", async () => {
    const { eventId, ticketTypeId } = await createPublishedEvent();
    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const adm = await admin();
    await adm.post(`/admin/organizers/${event.organizerId}/suspend`);
    expect((await request(app).get("/events")).body).toEqual([]);
    expect((await buy(ticketTypeId, 1)).status).toBe(409);
    await adm.post(`/admin/organizers/${event.organizerId}/unsuspend`);
    expect((await request(app).get("/events")).body).toHaveLength(1);
  });
});
