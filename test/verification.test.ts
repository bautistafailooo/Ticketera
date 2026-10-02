import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";
import { app, inDays, organizer } from "./helpers.js";

const tokenFromMail = (email: string) => {
  const mail = [...sentMails].reverse().find((m) => m.to === email && m.subject.startsWith("Confirmá tu email"));
  return mail?.html.match(/verificar\.html#([\w-]+)/)?.[1];
};

async function register(email = "nuevo@example.com") {
  const agent = request.agent(app);
  expect((await agent.post("/auth/register").send({ name: "Nuevo", email, password: "secreta123" })).status).toBe(201);
  await expect.poll(() => tokenFromMail(email)).toBeTruthy();
  return agent;
}

async function draftWithTicket(agent: ReturnType<typeof request.agent>) {
  const event = await agent.post("/organizer/events").send({ name: "Fiesta", venue: "Club", startsAt: inDays(10) });
  await agent.post(`/organizer/events/${event.body.id}/ticket-types`).send({ name: "General", priceCents: 0, capacity: 10 });
  return event.body.id as string;
}

describe("confirmar el email del organizador", () => {
  it("al registrarse recibe el link; hasta confirmarlo arma eventos pero no publica", async () => {
    const agent = await register();
    expect((await agent.get("/auth/me")).body.verified).toBe(false);
    const eventId = await draftWithTicket(agent);

    const blocked = await agent.post(`/organizer/events/${eventId}/publish`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/Confirmá tu email/);

    // El link se puede abrir sin sesión (por ejemplo, desde el celular).
    const token = tokenFromMail("nuevo@example.com")!;
    const res = await request(app).post("/auth/verify-email").send({ token });
    expect(res.body).toEqual({ ok: true, email: "nuevo@example.com" });
    expect((await agent.get("/auth/me")).body.verified).toBe(true);
    expect((await agent.post(`/organizer/events/${eventId}/publish`)).status).toBe(200);

    // Abrir el link otra vez no da error.
    expect((await request(app).post("/auth/verify-email").send({ token })).status).toBe(200);
  });

  it("rechaza links inventados o vencidos", async () => {
    await register();
    expect((await request(app).post("/auth/verify-email").send({ token: "x".repeat(40) })).status).toBe(400);
    await prisma.emailVerification.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/auth/verify-email").send({ token: tokenFromMail("nuevo@example.com") });
    expect(res.status).toBe(400);
    expect((await prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();
  });

  it("puede pedir que se lo reenvíen; ya confirmado, no", async () => {
    const agent = await register();
    sentMails.length = 0;
    const res = await agent.post("/auth/resend-verification");
    expect(res.body).toEqual({ ok: true, email: "nuevo@example.com" });
    await expect.poll(() => tokenFromMail("nuevo@example.com")).toBeTruthy();

    const verified = await organizer("listo@example.com");
    expect((await verified.post("/auth/resend-verification")).status).toBe(409);
  });

  it("sin confirmar no puede conectar Mercado Pago", async () => {
    const previous = config.mercadoPago;
    config.mercadoPago = { clientId: "app", clientSecret: "secreto", sandbox: false, apiUrl: "https://api.mp.test", authUrl: "https://auth.mp.test" };
    try {
      const agent = await register();
      const res = await agent.get("/organizer/mercadopago/connect");
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe("/panel.html?mp=verificar");
    } finally {
      config.mercadoPago = previous;
    }
  });
});
