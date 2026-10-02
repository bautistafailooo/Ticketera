import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";
import { admin, app, createPublishedEvent, organizer, paidTickets } from "./helpers.js";

const revoke = (body: Record<string, unknown>) => request(app).post("/legal/arrepentimiento").send(body);

describe("botón de arrepentimiento", () => {
  it("con el código de una entrada identifica la compra y manda el código de trámite", async () => {
    await admin();
    const { ticketTypeId } = await createPublishedEvent();
    const [code] = await paidTickets(ticketTypeId);
    sentMails.length = 0;

    const res = await revoke({ name: "Ana", email: "ANA@example.com", reference: code.toLowerCase().replaceAll("-", " "), reason: "No puedo ir" });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^ARR-[0-9A-Z]{6}$/);
    expect(res.body.orderFound).toBe(true);

    const saved = await prisma.revocationRequest.findUniqueOrThrow({ where: { code: res.body.code } });
    expect(saved.orderId).not.toBeNull();
    await expect.poll(() => sentMails.length).toBe(2);
    const toBuyer = sentMails.find((m) => m.to === "ANA@example.com")!;
    expect(toBuyer.html).toContain(res.body.code);
    expect(toBuyer.html).toContain("Recital de prueba");
    expect(sentMails.find((m) => m.to === "admin@example.com")?.subject).toContain(res.body.code);
  });

  it("con el link de la compra también la identifica", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    await paidTickets(ticketTypeId);
    const order = await prisma.order.findFirstOrThrow();
    const res = await revoke({ name: "Ana", email: "ana@example.com", reference: `https://ecko.test/orden.html#${order.id}.${order.accessToken}` });
    expect(res.body.orderFound).toBe(true);
  });

  it("si el email no coincide no vincula la compra, pero registra el pedido igual", async () => {
    const { ticketTypeId } = await createPublishedEvent();
    const [code] = await paidTickets(ticketTypeId);
    const res = await revoke({ name: "Otro", email: "otro@example.com", reference: code });
    expect(res.status).toBe(201);
    expect(res.body.orderFound).toBe(false);
    expect((await prisma.revocationRequest.findUniqueOrThrow({ where: { code: res.body.code } })).orderId).toBeNull();
  });

  it("pide nombre y email válidos", async () => {
    expect((await revoke({ email: "ana@example.com" })).status).toBe(400);
    expect((await revoke({ name: "Ana", email: "no-es-mail" })).status).toBe(400);
  });

  it("los administradores ven los pedidos y los marcan resueltos; un organizador no", async () => {
    const adminAgent = await admin();
    const res = await revoke({ name: "Ana", email: "ana@example.com" });
    const list = await adminAgent.get("/admin/arrepentimientos");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ code: res.body.code, resolvedAt: null });

    const id = list.body[0].id;
    expect((await adminAgent.post(`/admin/arrepentimientos/${id}/resolve`).send({ note: "Devuelto por Mercado Pago" })).status).toBe(200);
    expect((await adminAgent.post(`/admin/arrepentimientos/${id}/resolve`).send({ note: "otra vez" })).status).toBe(404);
    expect((await adminAgent.get("/admin/arrepentimientos")).body[0].resolutionNote).toBe("Devuelto por Mercado Pago");

    const org = await organizer("org2@example.com");
    expect((await org.get("/admin/arrepentimientos")).status).toBe(403);
  });

  it("las páginas legales existen y el pie de la portada las enlaza", async () => {
    for (const page of ["terminos", "privacidad", "devoluciones", "arrepentimiento"]) {
      expect((await request(app).get(`/${page}.html`)).status).toBe(200);
    }
    const home = await request(app).get("/");
    expect(home.text).toContain('href="/arrepentimiento.html"');
    expect(home.text).toContain('href="/terminos.html"');
  });
});
