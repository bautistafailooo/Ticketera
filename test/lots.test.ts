import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { lotStatus } from "../src/lots.js";
import { app, buy, inDays, organizer, pay } from "./helpers.js";

const type = (id: string, extra: Partial<Parameters<typeof lotStatus>[0]> = {}) => ({
  id,
  capacity: 10,
  sold: 0,
  salesEndAt: null,
  opensAfterId: null,
  ...extra,
});

describe("estado de los lotes", () => {
  it("terminado por fecha, agotado, y el siguiente se habilita cuando el anterior termina", () => {
    const now = new Date("2026-10-10T12:00:00Z");
    expect(lotStatus(type("a", { salesEndAt: new Date("2026-10-09T00:00:00Z") }), [], now)).toBe("ended");
    expect(lotStatus(type("a", { sold: 10 }), [], now)).toBe("soldout");

    const early = type("early");
    const first = type("first", { opensAfterId: "early" });
    const second = type("second", { opensAfterId: "first" });
    const all = [early, first, second];
    expect([early, first, second].map((t) => lotStatus(t, all, now))).toEqual(["onsale", "upcoming", "upcoming"]);

    early.sold = 10;
    expect([early, first, second].map((t) => lotStatus(t, all, now))).toEqual(["soldout", "onsale", "upcoming"]);

    first.salesEndAt = new Date("2026-10-01T00:00:00Z");
    expect([early, first, second].map((t) => lotStatus(t, all, now))).toEqual(["soldout", "ended", "onsale"]);
  });
});

describe("preventa y tandas", () => {
  async function eventWithLots() {
    const agent = await organizer();
    const event = await agent.post("/organizer/events").send({ name: "Fiesta", venue: "Club", startsAt: inDays(20) });
    const eventId = event.body.id as string;
    const early = await agent
      .post(`/organizer/events/${eventId}/ticket-types`)
      .send({ name: "Early bird", priceCents: 500000, capacity: 2, salesEndAt: inDays(5) });
    expect(early.status).toBe(201);
    const first = await agent
      .post(`/organizer/events/${eventId}/ticket-types`)
      .send({ name: "Primera tanda", priceCents: 800000, capacity: 10, opensAfterId: early.body.id });
    expect(first.status).toBe(201);
    expect((await agent.post(`/organizer/events/${eventId}/publish`)).status).toBe(200);
    return { agent, eventId, earlyId: early.body.id as string, firstId: first.body.id as string };
  }

  const statuses = async (eventId: string) =>
    Object.fromEntries((await request(app).get(`/events/${eventId}`)).body.ticketTypes.map((t: { name: string; status: string }) => [t.name, t.status]));

  it("la primera tanda se habilita sola cuando se agota el early bird", async () => {
    const { eventId, earlyId, firstId } = await eventWithLots();
    expect(await statuses(eventId)).toEqual({ "Early bird": "onsale", "Primera tanda": "upcoming" });

    const tooSoon = await buy(firstId, 1);
    expect(tooSoon.status).toBe(409);
    expect(tooSoon.body.error).toMatch(/todavía no está a la venta/);

    await pay((await buy(earlyId, 2)).body);
    expect(await statuses(eventId)).toEqual({ "Early bird": "soldout", "Primera tanda": "onsale" });
    expect((await buy(firstId, 1)).status).toBe(201);
  });

  it("cuando vence la preventa, se habilita la siguiente y la preventa ya no se vende", async () => {
    const { eventId, earlyId, firstId } = await eventWithLots();
    await prisma.ticketType.update({ where: { id: earlyId }, data: { salesEndAt: new Date(Date.now() - 1000) } });
    expect(await statuses(eventId)).toEqual({ "Early bird": "ended", "Primera tanda": "onsale" });
    const late = await buy(earlyId, 1);
    expect(late.status).toBe(409);
    expect(late.body.error).toMatch(/terminó/);
    expect((await buy(firstId, 1)).status).toBe(201);
  });

  it("el panel del organizador muestra el estado de cada lote", async () => {
    const { agent, eventId } = await eventWithLots();
    const types = (await agent.get(`/organizer/events/${eventId}`)).body.ticketTypes;
    expect(types.map((t: { status: string; opensAfterName: string | null }) => [t.status, t.opensAfterName])).toEqual([
      ["onsale", null],
      ["upcoming", "Early bird"],
    ]);
  });

  it("valida el lote anterior y la fecha de fin", async () => {
    const { agent, eventId } = await eventWithLots();
    const other = await agent.post("/organizer/events").send({ name: "Otra", venue: "Club", startsAt: inDays(20) });
    const otherType = await agent.post(`/organizer/events/${other.body.id}/ticket-types`).send({ name: "A", priceCents: 0, capacity: 1 });
    const draft = (await agent.post("/organizer/events").send({ name: "Borrador", venue: "Club", startsAt: inDays(20) })).body.id;

    const wrongEvent = await agent.post(`/organizer/events/${draft}/ticket-types`).send({ name: "B", priceCents: 0, capacity: 1, opensAfterId: otherType.body.id });
    expect(wrongEvent.status).toBe(400);
    const afterEvent = await agent.post(`/organizer/events/${draft}/ticket-types`).send({ name: "C", priceCents: 0, capacity: 1, salesEndAt: inDays(30) });
    expect(afterEvent.status).toBe(400);
    const past = await agent.post(`/organizer/events/${draft}/ticket-types`).send({ name: "D", priceCents: 0, capacity: 1, salesEndAt: inDays(-1) });
    expect(past.status).toBe(400);
    expect(eventId).toBeTruthy();
  });
});
