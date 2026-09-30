import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { admin, app, organizer } from "./helpers.js";

describe("cuentas", () => {
  it("registra, consulta la sesión y cierra sesión", async () => {
    const agent = await organizer();
    expect((await agent.get("/auth/me")).body).toMatchObject({ email: "org@example.com", trusted: true, suspended: false });
    await agent.post("/auth/logout");
    expect((await agent.get("/auth/me")).status).toBe(401);
  });

  it("las cuentas nuevas no son confiables", async () => {
    const agent = await organizer("nuevo@example.com", { trusted: false });
    expect((await agent.get("/auth/me")).body).toMatchObject({ role: "ORGANIZER", trusted: false });
  });

  it("inicia sesión solo con la contraseña correcta", async () => {
    await organizer();
    const wrong = await request(app).post("/auth/login").send({ email: "org@example.com", password: "incorrecta" });
    expect(wrong.status).toBe(401);
    const missing = await request(app).post("/auth/login").send({ email: "nadie@example.com", password: "incorrecta" });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBe(wrong.body.error);
    const ok = await request(app).post("/auth/login").send({ email: "ORG@example.com", password: "secreta123" });
    expect(ok.status).toBe(200);
    expect(ok.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("no permite registrar dos veces el mismo email", async () => {
    await organizer();
    const res = await request(app)
      .post("/auth/register")
      .send({ name: "Otro", email: "org@example.com", password: "secreta123" });
    expect(res.status).toBe(409);
  });

  it("explica en castellano qué dato es inválido", async () => {
    const res = await request(app).post("/auth/register").send({ name: "A", email: "a@example.com", password: "corta" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Contraseña: /);
  });

  it("no guarda la contraseña en texto plano", async () => {
    await organizer();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "org@example.com" } });
    expect(user.passwordHash).not.toContain("secreta123");
  });

  it("ignora cookies de sesión mal formadas", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "ticketera_session=%E0%A4%A");
    expect(res.status).toBe(401);
  });
});

describe("administración de organizadores", () => {
  it("solo un administrador ve y marca organizadores como confiables", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    expect((await org.get("/admin/organizers")).status).toBe(403);

    const adm = await admin();
    const list = await adm.get("/admin/organizers");
    const nuevo = list.body.find((u: { email: string }) => u.email === "nuevo@example.com");
    expect(nuevo.trustedAt).toBeNull();

    expect((await adm.post(`/admin/organizers/${nuevo.id}/trust`)).status).toBe(200);
    expect((await org.get("/auth/me")).body.trusted).toBe(true);
    expect((await adm.post(`/admin/organizers/${nuevo.id}/untrust`)).status).toBe(200);
    expect((await org.get("/auth/me")).body.trusted).toBe(false);
  });

  it("no se puede cambiar el estado de un administrador", async () => {
    const adm = await admin();
    const me = (await adm.get("/auth/me")).body;
    expect((await adm.post(`/admin/organizers/${me.id}/suspend`)).status).toBe(409);
  });
});
