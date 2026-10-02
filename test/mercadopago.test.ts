import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { sentMails } from "../src/mail/transport.js";
import { decrypt, encrypt } from "../src/payments/crypto.js";
import { app, buy, getOrder, inDays, organizer } from "./helpers.js";

// Mercado Pago falso: responde como la API real a lo que usa ecko.
type FakePayment = { id: number; status: string; external_reference: string; transaction_amount: number; currency_id: string };
const fake = {
  payments: new Map<number, FakePayment>(),
  preferences: [] as { token: string; body: Record<string, any> }[],
  refunds: [] as { token: string; paymentId: string }[],
  oauthCalls: [] as Record<string, any>[],
};
const SELLER_TOKEN = "APP_USR-token-del-organizador";

function fakeFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(String(input));
  const auth = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const json = (status: number, data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status }));
  if (url.pathname === "/oauth/token") {
    fake.oauthCalls.push(body);
    if (body.code === "codigo-malo") return json(400, { error: "invalid_grant" });
    return json(200, { access_token: SELLER_TOKEN, refresh_token: "TG-refresh", user_id: 123456, expires_in: 15552000 });
  }
  if (auth !== SELLER_TOKEN) return json(401, { message: "invalid token" });
  if (url.pathname === "/checkout/preferences") {
    fake.preferences.push({ token: auth, body });
    return json(201, { id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" });
  }
  if (url.pathname === "/v1/payments/search") {
    const ref = url.searchParams.get("external_reference");
    return json(200, { results: [...fake.payments.values()].filter((p) => p.external_reference === ref) });
  }
  const refund = url.pathname.match(/^\/v1\/payments\/(\d+)\/refunds$/);
  if (refund) {
    fake.refunds.push({ token: auth, paymentId: refund[1] });
    return json(201, { id: 1 });
  }
  const payment = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
  if (payment) {
    const found = fake.payments.get(Number(payment[1]));
    return found ? json(200, found) : json(404, { message: "Payment not found" });
  }
  return json(404, { message: "not found" });
}

const original = { mercadoPago: config.mercadoPago, simulatedPayments: config.simulatedPayments, sitePassword: config.sitePassword };

beforeEach(() => {
  config.mercadoPago = {
    clientId: "app-123",
    clientSecret: "secreto-de-la-app",
    sandbox: false,
    apiUrl: "https://api.mp.test",
    authUrl: "https://auth.mp.test",
  };
  config.simulatedPayments = false;
  fake.payments.clear();
  fake.preferences.length = 0;
  fake.refunds.length = 0;
  fake.oauthCalls.length = 0;
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(() => {
  Object.assign(config, original);
  vi.unstubAllGlobals();
});

// Conecta la cuenta de Mercado Pago del organizador como lo haría el navegador.
async function connect(agent: ReturnType<typeof request.agent>) {
  const start = await agent.get("/organizer/mercadopago/connect");
  expect(start.status).toBe(302);
  const state = new URL(start.headers.location).searchParams.get("state");
  const back = await agent.get(`/organizer/mercadopago/callback?code=codigo-ok&state=${state}`);
  expect(back.headers.location).toBe("/panel.html?mp=ok");
}

async function sellingEvent({ capacity = 5, priceCents = 1000000 } = {}) {
  const agent = await organizer(`org-${Math.random()}@example.com`);
  await connect(agent);
  const event = await agent.post("/organizer/events").send({ name: "Fiesta", venue: "Club", startsAt: inDays(10) });
  const type = await agent.post(`/organizer/events/${event.body.id}/ticket-types`).send({ name: "General", priceCents, capacity });
  expect((await agent.post(`/organizer/events/${event.body.id}/publish`)).status).toBe(200);
  return { agent, eventId: event.body.id as string, ticketTypeId: type.body.id as string };
}

function approvedPayment(orderId: string, totalCents: number, id = 9001) {
  const payment = { id, status: "approved", external_reference: orderId, transaction_amount: totalCents / 100, currency_id: "ARS" };
  fake.payments.set(id, payment);
  return payment;
}

const notify = (orderId: string, paymentId: number) =>
  request(app).post(`/payments/mercadopago/webhook?order=${orderId}`).send({ type: "payment", action: "payment.updated", data: { id: String(paymentId) } });

const waitForMail = (subject: string) =>
  expect.poll(() => sentMails.some((m) => m.subject.startsWith(subject))).toBe(true);

describe("conectar Mercado Pago", () => {
  it("el organizador conecta su cuenta y el token queda cifrado", async () => {
    const agent = await organizer();
    expect((await agent.get("/organizer/mercadopago")).body).toMatchObject({ available: true, required: true, connected: false });

    const start = await agent.get("/organizer/mercadopago/connect");
    const authUrl = new URL(start.headers.location);
    expect(authUrl.origin + authUrl.pathname).toBe("https://auth.mp.test/authorization");
    expect(authUrl.searchParams.get("client_id")).toBe("app-123");
    expect(authUrl.searchParams.get("redirect_uri")).toBe("https://ecko.test/organizer/mercadopago/callback");

    const state = authUrl.searchParams.get("state");
    const back = await agent.get(`/organizer/mercadopago/callback?code=codigo-ok&state=${state}`);
    expect(back.headers.location).toBe("/panel.html?mp=ok");
    expect(fake.oauthCalls[0]).toMatchObject({ grant_type: "authorization_code", code: "codigo-ok", client_secret: "secreto-de-la-app" });

    expect((await agent.get("/organizer/mercadopago")).body.connected).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "org@example.com" } });
    expect(user.mpUserId).toBe("123456");
    expect(user.mpAccessToken).not.toContain(SELLER_TOKEN);
    expect(decrypt(user.mpAccessToken!, "secreto-de-la-app")).toBe(SELLER_TOKEN);
  });

  it("rechaza la vuelta sin el state correcto (link armado por otro)", async () => {
    const agent = await organizer();
    await agent.get("/organizer/mercadopago/connect");
    const back = await agent.get("/organizer/mercadopago/callback?code=codigo-ok&state=otro");
    expect(back.headers.location).toBe("/panel.html?mp=error");
    expect(fake.oauthCalls).toHaveLength(0);
    // El state sirve una sola vez.
    const other = await organizer("otro@example.com");
    const back2 = await other.get("/organizer/mercadopago/callback?code=codigo-ok&state=");
    expect(back2.headers.location).toBe("/panel.html?mp=error");
  });

  it("si Mercado Pago rechaza el código, no queda conectada", async () => {
    const agent = await organizer();
    const start = await agent.get("/organizer/mercadopago/connect");
    const state = new URL(start.headers.location).searchParams.get("state");
    const back = await agent.get(`/organizer/mercadopago/callback?code=codigo-malo&state=${state}`);
    expect(back.headers.location).toBe("/panel.html?mp=error");
    expect((await agent.get("/organizer/mercadopago")).body.connected).toBe(false);
  });

  it("sin cuenta conectada no se pueden publicar eventos pagos (los gratis sí)", async () => {
    const agent = await organizer();
    const event = await agent.post("/organizer/events").send({ name: "Fiesta", venue: "Club", startsAt: inDays(10) });
    await agent.post(`/organizer/events/${event.body.id}/ticket-types`).send({ name: "Libre", priceCents: 0, capacity: 5 });
    const free = await agent.post(`/organizer/events/${event.body.id}/publish`);
    expect(free.status).toBe(200);

    const paid = await agent.post("/organizer/events").send({ name: "Paga", venue: "Club", startsAt: inDays(10) });
    await agent.post(`/organizer/events/${paid.body.id}/ticket-types`).send({ name: "General", priceCents: 500000, capacity: 5 });
    const res = await agent.post(`/organizer/events/${paid.body.id}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Mercado Pago/);

    await connect(agent);
    expect((await agent.post(`/organizer/events/${paid.body.id}/publish`)).status).toBe(200);
  });

  it("si el organizador desconecta su cuenta, no se puede comprar", async () => {
    const { agent, ticketTypeId } = await sellingEvent();
    await agent.post("/organizer/mercadopago/disconnect");
    expect((await buy(ticketTypeId, 1)).status).toBe(409);
  });
});

describe("pagar con Mercado Pago", () => {
  it("crea el checkout con el token del organizador y la comisión de ecko", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 2)).body;
    expect(order).toMatchObject({ totalCents: 2200000, feeCents: 200000 });
    expect((await getOrder(order)).body.payment).toEqual({ mercadoPago: true, simulated: false });

    const res = await request(app).post(`/orders/${order.id}/checkout`).set("x-order-token", order.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.url).toContain("mercadopago.com.ar");

    const { token, body } = fake.preferences[0];
    expect(token).toBe(SELLER_TOKEN);
    expect(body.external_reference).toBe(order.id);
    expect(body.marketplace_fee).toBe(2000);
    expect(body.items).toEqual([
      { title: "Fiesta - General", quantity: 2, unit_price: 10000, currency_id: "ARS" },
      { title: "Cargo por servicio", quantity: 1, unit_price: 2000, currency_id: "ARS" },
    ]);
    expect(body.notification_url).toBe(`https://ecko.test/payments/mercadopago/webhook?order=${order.id}`);
    expect(body.back_urls.success).toBe(`https://ecko.test/orden.html?volver=${order.id}`);
    expect(body.auto_return).toBe("approved");
    expect(body.binary_mode).toBe(true);
  });

  it("sin la clave de la orden no se puede crear el checkout", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    expect((await request(app).post(`/orders/${order.id}/checkout`).set("x-order-token", "otra")).status).toBe(404);
  });

  it("la notificación de un pago aprobado confirma la orden y manda las entradas", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 2)).body;
    approvedPayment(order.id, order.totalCents);

    expect((await notify(order.id, 9001)).status).toBe(200);
    const paid = (await getOrder(order)).body;
    expect(paid.status).toBe("PAID");
    expect(paid.tickets[0].code).toBeTruthy();
    await waitForMail("Tus entradas");

    // Mercado Pago repite notificaciones: la segunda no hace nada.
    expect((await notify(order.id, 9001)).status).toBe(200);
    expect(fake.refunds).toHaveLength(0);
    expect(sentMails.filter((m) => m.subject.startsWith("Tus entradas"))).toHaveLength(1);
  });

  it("no confirma pagos que no son de la orden, no aprobados o por otro monto", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    const other = (await buy(ticketTypeId, 1)).body;

    approvedPayment(other.id, order.totalCents, 1); // de otra orden
    fake.payments.set(2, { id: 2, status: "rejected", external_reference: order.id, transaction_amount: order.totalCents / 100, currency_id: "ARS" });
    approvedPayment(order.id, order.totalCents - 100, 3); // monto menor
    for (const id of [1, 2, 3, 404]) await notify(order.id, id);

    expect((await getOrder(order)).body.status).toBe("PENDING");
  });

  it("al volver de Mercado Pago, check-payment busca el pago aunque no haya llegado la notificación", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    const check = () => request(app).post(`/orders/${order.id}/check-payment`).set("x-order-token", order.accessToken).send({});
    expect((await check()).body.status).toBe("PENDING");
    approvedPayment(order.id, order.totalCents);
    expect((await check()).body.status).toBe("PAID");
  });

  it("un segundo pago de la misma orden se devuelve", async () => {
    const { ticketTypeId } = await sellingEvent();
    const order = (await buy(ticketTypeId, 1)).body;
    approvedPayment(order.id, order.totalCents, 1);
    approvedPayment(order.id, order.totalCents, 2);
    await notify(order.id, 1);
    await notify(order.id, 2);
    expect((await getOrder(order)).body.status).toBe("PAID");
    expect(fake.refunds).toEqual([{ token: SELLER_TOKEN, paymentId: "2" }]);
  });

  it("un pago que llega con la reserva vencida confirma la orden si todavía hay lugar", async () => {
    const { ticketTypeId } = await sellingEvent({ capacity: 2 });
    const order = (await buy(ticketTypeId, 2)).body;
    await prisma.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await getOrder(order)).body.status).toBe("EXPIRED");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).sold).toBe(0);

    approvedPayment(order.id, order.totalCents);
    await notify(order.id, 9001);
    expect((await getOrder(order)).body.status).toBe("PAID");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).sold).toBe(2);
    expect(fake.refunds).toHaveLength(0);
  });

  it("un pago que llega con la reserva vencida y sin lugar se devuelve y se avisa al comprador", async () => {
    const { ticketTypeId } = await sellingEvent({ capacity: 1 });
    const order = (await buy(ticketTypeId, 1)).body;
    await prisma.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await getOrder(order); // vence y libera el lugar
    const other = (await buy(ticketTypeId, 1)).body; // otra persona compra el último lugar
    expect(other.status).toBe("PENDING");

    approvedPayment(order.id, order.totalCents);
    await notify(order.id, 9001);
    await notify(order.id, 9001); // repetida: no devuelve dos veces

    const after = (await getOrder(order)).body;
    expect(after).toMatchObject({ status: "EXPIRED", refunded: true });
    expect(fake.refunds).toEqual([{ token: SELLER_TOKEN, paymentId: "9001" }]);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } })).sold).toBe(1);
    await waitForMail("Te devolvimos el pago");
  });

  it("la notificación entra aunque el sitio tenga contraseña", async () => {
    config.sitePassword = "clave-del-sitio";
    const res = await request(app).post("/payments/mercadopago/webhook?order=x").send({ type: "payment", data: { id: "1" } });
    expect(res.status).toBe(200);
    expect((await request(app).get("/events")).status).toBe(401);
  });

  it("ignora notificaciones que no son de pagos", async () => {
    const res = await request(app).post("/payments/mercadopago/webhook?order=x").send({ type: "merchant_order", data: { id: "1" } });
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("cifrado de los tokens", () => {
  it("con otro secreto no se puede descifrar", () => {
    const value = encrypt("token", "secreto");
    expect(decrypt(value, "secreto")).toBe("token");
    expect(decrypt(value, "otro")).toBeNull();
    expect(decrypt("basura", "secreto")).toBeNull();
  });
});

describe("checkout sin email del comprador", () => {
  it("no manda el email del formulario a Mercado Pago (bloquea el pago si no coincide con la cuenta)", async () => {
    const agent = await organizer();
    const start = await agent.get("/organizer/mercadopago/connect");
    const state = new URL(start.headers.location).searchParams.get("state");
    await agent.get(`/organizer/mercadopago/callback?code=codigo-ok&state=${state}`);
    const event = await agent.post("/organizer/events").send({ name: "Fiesta", venue: "Club", startsAt: inDays(10) });
    const type = await agent.post(`/organizer/events/${event.body.id}/ticket-types`).send({ name: "General", priceCents: 100000, capacity: 5 });
    await agent.post(`/organizer/events/${event.body.id}/publish`);
    const order = (await buy(type.body.id, 1)).body;
    await request(app).post(`/orders/${order.id}/checkout`).set("x-order-token", order.accessToken);
    expect(fake.preferences[0].body.payer).toBeUndefined();
  });
});
