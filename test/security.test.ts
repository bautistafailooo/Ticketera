import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { app, organizer } from "./helpers.js";

describe("seguridad", () => {
  afterEach(() => {
    config.rateLimits = false;
  });

  it("envía cabeceras de seguridad y no permite scripts de otros sitios", async () => {
    const res = await request(app).get("/");
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("ninguna página tiene scripts escritos dentro del HTML", async () => {
    for (const page of ["/", "/evento.html", "/orden.html", "/login.html", "/panel.html", "/panel-evento.html", "/puerta.html", "/admin.html", "/restablecer.html"]) {
      const res = await request(app).get(page);
      expect(res.status, page).toBe(200);
      expect(res.text, page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    }
  });

  it("las respuestas de la API no se guardan en caché", async () => {
    const res = await request(app).get("/events");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("responde 400 a un JSON mal formado", async () => {
    const res = await request(app).post("/auth/login").set("content-type", "application/json").send("{mal");
    expect(res.status).toBe(400);
  });

  it("frena los intentos repetidos de login sobre una cuenta", async () => {
    await organizer();
    config.rateLimits = true;
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await request(app).post("/auth/login").send({ email: "org@example.com", password: `mala-${i}` })).status;
    }
    expect(last).toBe(429);
  });

  it("sirve el decodificador de QR de la app de puerta", async () => {
    expect((await request(app).get("/vendor/jsQR.js")).status).toBe(200);
  });
});

describe("límites que no frenan a la gente que compra", () => {
  it("consultar el pago varias veces y confirmar emails no comparten el límite de compras ni de contraseñas", async () => {
    const { config } = await import("../src/config.js");
    const previous = config.rateLimits;
    config.rateLimits = true;
    try {
      const statuses = new Set<number>();
      // Como si muchas personas detrás de la misma IP volvieran de Mercado Pago.
      for (let i = 0; i < 40; i++) statuses.add((await request(app).post("/orders/no-existe/check-payment").set("x-order-token", "x").send({})).status);
      for (let i = 0; i < 10; i++) statuses.add((await request(app).post("/auth/verify-email").send({ token: "y".repeat(40) })).status);
      expect(statuses.has(429)).toBe(false);
    } finally {
      config.rateLimits = previous;
    }
  });
});
