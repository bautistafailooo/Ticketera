import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";
import { admin, app, buy, createPublishedEvent, draftEvent, getOrder, organizer, pay } from "./helpers.js";

// Los mails se mandan en segundo plano: espera a que aparezca el que buscamos.
async function waitForMail(match: (m: (typeof sentMails)[number]) => boolean) {
  for (let i = 0; i < 50; i++) {
    const found = sentMails.find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`No llegó el mail. Enviados: ${sentMails.map((m) => m.subject).join(" | ")}`);
}

describe("mail de entradas", () => {
  it("al pagar se mandan las entradas con su QR y el link a la compra", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 2)).body;
    expect(sentMails).toHaveLength(0); // todavía no pagó
    await pay(order);

    const mail = await waitForMail((m) => m.to === "ana@example.com");
    expect(mail.subject).toBe("Tus entradas para Recital de prueba");
    expect(mail.attachments).toHaveLength(2);
    expect(mail.attachments![0].contentType).toBe("image/png");
    const codes = (await getOrder(order)).body.tickets.map((t: { code: string }) => t.code);
    for (const code of codes) expect(mail.html).toContain(code);
    expect(mail.html).toContain(`https://ecko.test/orden.html#${order.id}.${order.accessToken}`);
    await expect.poll(async () => (await prisma.order.findUnique({ where: { id: order.id } }))?.emailedAt).toBeTruthy();
  });

  it("las entradas gratis se mandan al comprar", async () => {
    const { ticketTypeId } = await createPublishedEvent(10, 0);
    await buy(ticketTypeId, 1);
    await waitForMail((m) => m.subject.startsWith("Tus entradas"));
  });

  it("escapa el texto de los usuarios dentro del mail", async () => {
    const { eventId, ticketTypeId } = await createPublishedEvent();
    await prisma.event.update({ where: { id: eventId }, data: { name: 'Fiesta <img src=x onerror="alert(1)">' } });
    await pay((await buy(ticketTypeId, 1)).body);
    const mail = await waitForMail(() => true);
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });

  it("se pueden reenviar las entradas, con la clave de la orden y pocas veces", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    const resend = () => request(app).post(`/orders/${order.id}/resend-email`).set("x-order-token", order.accessToken);
    expect((await resend()).status).toBe(409); // sin pagar
    await pay(order);
    await waitForMail(() => true);
    expect((await request(app).post(`/orders/${order.id}/resend-email`).set("x-order-token", "otra")).status).toBe(404);
    const res = await resend();
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("ana@example.com");
    expect(sentMails.length).toBe(2);
  });
});

describe("olvidé mi contraseña", () => {
  const tokenFrom = (html: string) => decodeURIComponent(html.match(/restablecer\.html#([\w%-]+)/)![1]);

  it("manda un link que cambia la contraseña una sola vez y cierra las sesiones", async () => {
    const org = await organizer();
    const res = await request(app).post("/auth/forgot").send({ email: "ORG@example.com" });
    expect(res.status).toBe(200);
    const mail = await waitForMail((m) => m.to === "org@example.com");
    const token = tokenFrom(mail.html);

    const reset = await request(app).post("/auth/reset").send({ token, password: "nueva-clave-123" });
    expect(reset.status).toBe(200);
    expect((await org.get("/auth/me")).status).toBe(401); // la sesión vieja se cerró

    const login = await request(app).post("/auth/login").send({ email: "org@example.com", password: "nueva-clave-123" });
    expect(login.status).toBe(200);
    const old = await request(app).post("/auth/login").send({ email: "org@example.com", password: "secreta123" });
    expect(old.status).toBe(401);

    // El mismo link no sirve dos veces.
    expect((await request(app).post("/auth/reset").send({ token, password: "otra-clave-456" })).status).toBe(400);
  });

  it("no revela si el email tiene cuenta", async () => {
    const res = await request(app).post("/auth/forgot").send({ email: "nadie@example.com" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sentMails).toHaveLength(0);
  });

  it("rechaza links vencidos o inventados", async () => {
    await organizer();
    await request(app).post("/auth/forgot").send({ email: "org@example.com" });
    const token = tokenFrom((await waitForMail(() => true)).html);
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/auth/reset").send({ token, password: "nueva-clave-123" })).status).toBe(400);
    expect((await request(app).post("/auth/reset").send({ token: "x".repeat(43), password: "nueva-clave-123" })).status).toBe(400);
  });

  it("guarda solo el hash del token", async () => {
    await organizer();
    await request(app).post("/auth/forgot").send({ email: "org@example.com" });
    const token = tokenFrom((await waitForMail(() => true)).html);
    const stored = await prisma.passwordReset.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);
  });
});

describe("avisos de revisión", () => {
  it("avisa a los administradores y al organizador en cada paso", async () => {
    await admin("admin@example.com");
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org, "Festival Nuevo");
    await org.post(`/organizer/events/${eventId}/publish`);
    const toAdmin = await waitForMail((m) => m.to === "admin@example.com");
    expect(toAdmin.subject).toBe("Evento para revisar: Festival Nuevo");

    const adm = request.agent(app);
    await adm.post("/auth/login").send({ email: "admin@example.com", password: "secreta123" });
    await adm.post(`/admin/events/${eventId}/reject`).send({ note: "Falta la dirección" });
    const rejected = await waitForMail((m) => m.to === "nuevo@example.com");
    expect(rejected.subject).toContain("necesita cambios");
    expect(rejected.html).toContain("Falta la dirección");

    await org.post(`/organizer/events/${eventId}/publish`);
    await adm.post(`/admin/events/${eventId}/approve`);
    await waitForMail((m) => m.to === "nuevo@example.com" && m.subject.includes("ya está a la venta"));
  });
});
