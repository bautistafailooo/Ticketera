import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";
import { app, createPublishedEvent, doorToken, organizer } from "./helpers.js";

const send = (agent: ReturnType<typeof request.agent>, eventId: string, body: Record<string, unknown>) =>
  agent.post(`/organizer/events/${eventId}/cortesias`).send(body);

describe("cortesías", () => {
  it("manda las entradas por mail, ocupan lugar y se cuentan aparte de las ventas", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(5);
    const res = await send(agent, eventId, { name: "Invitada", email: "invitada@example.com", ticketTypeId, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ quantity: 2, email: "invitada@example.com" });

    await expect.poll(() => sentMails.find((m) => m.to === "invitada@example.com")).toBeTruthy();
    const mail = sentMails.find((m) => m.to === "invitada@example.com")!;
    expect(mail.subject).toBe("Tu invitación para Recital de prueba");
    expect(mail.attachments).toHaveLength(2);

    const order = await prisma.order.findFirstOrThrow({ where: { buyerEmail: "invitada@example.com" } });
    expect(order).toMatchObject({ status: "PAID", complimentary: true, totalCents: 0, feeCents: 0 });

    const detail = (await agent.get(`/organizer/events/${eventId}`)).body;
    expect(detail.totals).toMatchObject({ sold: 2, paid: 0, courtesy: 2, revenueCents: 0 });
    expect(detail.orders[0].complimentary).toBe(true);
  });

  it("las entradas de cortesía se validan en la puerta como cualquier otra", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(5);
    await send(agent, eventId, { name: "Invitado", email: "inv@example.com", ticketTypeId, quantity: 1 });
    const { code } = await prisma.ticket.findFirstOrThrow({ where: { order: { complimentary: true } } });
    const token = await doorToken(agent, eventId);
    const res = await request(app).post("/door/check-in").set("x-door-token", token).send({ code });
    expect(res.status).toBe(200);
  });

  it("respeta el cupo y valida los datos", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(2);
    expect((await send(agent, eventId, { name: "A", email: "a@example.com", ticketTypeId, quantity: 3 })).status).toBe(409);
    expect((await send(agent, eventId, { name: "A", email: "a@example.com", ticketTypeId, quantity: 11 })).status).toBe(400);
    expect((await send(agent, eventId, { name: "A", email: "no-es-mail", ticketTypeId, quantity: 1 })).status).toBe(400);
    expect((await send(agent, eventId, { name: "A", email: "a@example.com", ticketTypeId: "otro", quantity: 1 })).status).toBe(400);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).sold).toBe(0);
  });

  it("solo el organizador del evento, y con el email confirmado", async () => {
    const { eventId, ticketTypeId } = await createPublishedEvent();
    const other = await organizer("otro@example.com");
    expect((await send(other, eventId, { name: "A", email: "a@example.com", ticketTypeId, quantity: 1 })).status).toBe(404);

    const own = await createPublishedEvent();
    await prisma.user.updateMany({ where: { events: { some: { id: own.eventId } } }, data: { emailVerifiedAt: null } });
    const res = await send(own.agent, own.eventId, { name: "A", email: "a@example.com", ticketTypeId: own.ticketTypeId, quantity: 1 });
    expect(res.status).toBe(403);
  });
});

describe("cortesías según el estado del evento", () => {
  it("no se mandan para un evento pausado o en revisión", async () => {
    const { agent, eventId, ticketTypeId } = await createPublishedEvent(5);
    for (const status of ["PAUSED", "PENDING_REVIEW"] as const) {
      await prisma.event.update({ where: { id: eventId }, data: { status } });
      const res = await send(agent, eventId, { name: "A", email: "a@example.com", ticketTypeId, quantity: 1 });
      expect(res.status).toBe(409);
    }
  });
});
