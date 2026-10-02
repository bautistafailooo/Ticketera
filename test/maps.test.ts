import request from "supertest";
import { describe, expect, it } from "vitest";
import { sentMails } from "../src/mail/transport.js";
import { app, buy, getOrder, inDays, organizer, pay } from "./helpers.js";

async function eventWithAddress(address?: string) {
  const agent = await organizer();
  const event = await agent.post("/organizer/events").send({ name: "Recital", venue: "Estadio Obras", address, startsAt: inDays(10) });
  expect(event.status).toBe(201);
  const type = await agent.post(`/organizer/events/${event.body.id}/ticket-types`).send({ name: "Campo", priceCents: 100000, capacity: 10 });
  expect((await agent.post(`/organizer/events/${event.body.id}/publish`)).status).toBe(200);
  return { agent, eventId: event.body.id as string, ticketTypeId: type.body.id as string };
}

describe("mapa del evento", () => {
  it("con dirección, la página del evento trae el mapa y el link para llegar", async () => {
    const { eventId } = await eventWithAddress("Av. del Libertador 7395, CABA");
    const res = await request(app).get(`/events/${eventId}`);
    expect(res.body.address).toBe("Av. del Libertador 7395, CABA");
    const q = encodeURIComponent("Av. del Libertador 7395, CABA");
    expect(res.body.map).toEqual({
      embedUrl: `https://www.google.com/maps?q=${q}&hl=es&z=15&output=embed`,
      directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    });
  });

  it("sin dirección no hay mapa, y borrarla al editar la saca", async () => {
    const { agent, eventId } = await eventWithAddress();
    expect((await request(app).get(`/events/${eventId}`)).body.map).toBeNull();

    await agent.patch(`/organizer/events/${eventId}`).send({ address: "Corrientes 857" });
    expect((await request(app).get(`/events/${eventId}`)).body.map).not.toBeNull();
    await agent.patch(`/organizer/events/${eventId}`).send({ address: "  " });
    const after = (await request(app).get(`/events/${eventId}`)).body;
    expect(after.address).toBeNull();
    expect(after.map).toBeNull();
  });

  it("el mapa de Google está permitido por la política de seguridad", async () => {
    const res = await request(app).get("/evento.html");
    expect(res.headers["content-security-policy"]).toContain("frame-src https://www.google.com https://maps.google.com");
  });

  it("la compra y el mail de las entradas traen la dirección y cómo llegar", async () => {
    const { ticketTypeId } = await eventWithAddress("Av. del Libertador 7395, CABA");
    const order = (await buy(ticketTypeId, 1)).body;
    await pay(order);
    const full = (await getOrder(order)).body;
    expect(full.event.address).toBe("Av. del Libertador 7395, CABA");
    expect(full.event.directionsUrl).toContain("google.com/maps/dir/");

    await expect.poll(() => sentMails.length).toBe(1);
    expect(sentMails[0].html).toContain("Av. del Libertador 7395, CABA");
    expect(sentMails[0].html).toContain("cómo llegar");
    expect(sentMails[0].text).toContain("Cómo llegar: https://www.google.com/maps/dir/");
  });
});
