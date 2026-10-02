import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, buy, createPublishedEvent, draftEvent, inDays, organizer, pay } from "./helpers.js";

const path = (eventId: string, typeId: string) => `/organizer/events/${eventId}/ticket-types/${typeId}`;

describe("editar y borrar tipos de entrada", () => {
  it("edita nombre, precio y cupo; el precio nuevo vale solo para compras nuevas", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10, 100000);
    const first = (await buy(ticketTypeId, 1)).body;
    await pay(first);

    const res = await agent.patch(path(eventId, ticketTypeId)).send({ name: "Campo VIP", priceCents: 150000, capacity: 20 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Campo VIP", priceCents: 150000, capacity: 20 });

    const second = (await buy(ticketTypeId, 1)).body;
    const prices = (await prisma.ticket.findMany({ orderBy: { createdAt: "asc" } })).map((t) => t.priceCents);
    expect(prices).toEqual([100000, 150000]);
    expect(second.totalCents).toBe(165000);
  });

  it("el cupo no puede quedar por debajo de lo vendido o reservado", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10);
    await buy(ticketTypeId, 3); // reservadas, sin pagar
    const res = await agent.patch(path(eventId, ticketTypeId)).send({ capacity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Ya hay 3 entradas/);
    expect((await agent.patch(path(eventId, ticketTypeId)).send({ capacity: 3 })).status).toBe(200);
  });

  it("agrega y saca opciones de lote, sin dejar armar círculos", async () => {
    const agent = await organizer();
    const { eventId, ticketTypeId: a } = await draftEvent(agent);
    const b = (await agent.post(`/organizer/events/${eventId}/ticket-types`).send({ name: "Segunda", priceCents: 2000, capacity: 5, opensAfterId: a })).body.id;

    expect((await agent.patch(path(eventId, a)).send({ opensAfterId: b })).status).toBe(400); // a después de b, y b después de a
    expect((await agent.patch(path(eventId, a)).send({ opensAfterId: a })).status).toBe(400);

    expect((await agent.patch(path(eventId, a)).send({ salesEndAt: inDays(5) })).body.salesEndAt).toBeTruthy();
    const cleared = await agent.patch(path(eventId, b)).send({ salesEndAt: null, opensAfterId: null });
    expect(cleared.body).toMatchObject({ salesEndAt: null, opensAfterId: null });
  });

  it("borra un tipo sin entradas, pero no uno con entradas ni el último de un evento publicado", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(10);
    const extra = (await agent.post(`/organizer/events/${eventId}/ticket-types`).send({ name: "Extra", priceCents: 0, capacity: 5 })).body.id;
    expect((await agent.delete(path(eventId, extra))).status).toBe(200);
    expect(await prisma.ticketType.count({ where: { id: extra } })).toBe(0);

    expect((await agent.delete(path(eventId, ticketTypeId))).status).toBe(409); // el único del evento publicado

    await agent.post(`/organizer/events/${eventId}/ticket-types`).send({ name: "Otro", priceCents: 0, capacity: 5 });
    await buy(ticketTypeId, 1);
    const withTickets = await agent.delete(path(eventId, ticketTypeId));
    expect(withTickets.status).toBe(409);
    expect(withTickets.body.error).toMatch(/ya tiene entradas/);
  });

  it("otro organizador no puede tocarlos y uno no confiable no edita un evento aprobado", async () => {
    const { eventId, ticketTypeId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await other.patch(path(eventId, ticketTypeId)).send({ capacity: 5 })).status).toBe(404);
    expect((await other.delete(path(eventId, ticketTypeId))).status).toBe(404);

    const untrusted = await organizer("nuevo@example.com", { trusted: false });
    const { eventId: own, ticketTypeId: ownType } = await draftEvent(untrusted);
    await prisma.event.update({ where: { id: own }, data: { status: "PUBLISHED" } });
    expect((await untrusted.patch(path(own, ownType)).send({ priceCents: 1 })).status).toBe(409);
    expect((await request(app).patch(path(own, ownType)).send({})).status).toBe(401);
  });
});
