import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, createPublishedEvent } from "./helpers.js";

const meta = (html: string, property: string) => html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`))?.[1];

describe("vista previa al compartir", () => {
  it("la página del evento trae título, fecha, lugar, precio y flyer para WhatsApp", async () => {
    const { eventId } = await createPublishedEvent(10, 1500000);
    await prisma.event.update({ where: { id: eventId }, data: { imageFile: "abc123.webp", name: 'Fiesta <"Neón">' } });
    const res = await request(app).get(`/evento.html?id=${eventId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Fiesta &lt;&quot;Neón&quot;&gt; · ecko</title>");
    expect(meta(res.text, "og:title")).toBe("Fiesta &lt;&quot;Neón&quot;&gt;");
    expect(meta(res.text, "og:description")).toMatch(/ · Estadio · Desde \$\s?15\.000$/);
    expect(meta(res.text, "og:image")).toBe("https://ecko.test/media/abc123.webp");
    expect(meta(res.text, "og:url")).toBe(`https://ecko.test/evento.html?id=${eventId}`);
    expect(res.text).toContain('<script type="module" src="/js/evento.js">');
  });

  it("sin flyer usa la imagen de ecko; un evento que no está a la venta no muestra nada", async () => {
    const { eventId } = await createPublishedEvent();
    expect(meta((await request(app).get(`/evento.html?id=${eventId}`)).text, "og:image")).toBe("https://ecko.test/og.png");

    await prisma.event.update({ where: { id: eventId }, data: { status: "PAUSED" } });
    const paused = await request(app).get(`/evento.html?id=${eventId}`);
    expect(paused.status).toBe(200);
    expect(meta(paused.text, "og:title")).toBeUndefined();
  });

  it("la portada tiene su vista previa", async () => {
    const res = await request(app).get("/");
    expect(meta(res.text, "og:title")).toBe("ecko · Entradas para eventos");
    expect(meta(res.text, "og:image")).toBe("https://ecko.test/og.png");
    expect(res.text.match(/<meta name="description"/g)).toHaveLength(1);
    expect((await request(app).get("/og.png")).status).toBe(200);
  });
});
