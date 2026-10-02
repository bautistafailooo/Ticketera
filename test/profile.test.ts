import request from "supertest";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, createPublishedEvent, draftEvent } from "./helpers.js";

describe("perfil del organizador", () => {
  it("edita la descripción y las redes, normalizando Instagram y el sitio web", async () => {
    const { agent } = await createPublishedEvent();
    const res = await agent.patch("/organizer/profile").send({
      bio: "Fiestas electrónicas en Buenos Aires.",
      instagram: "https://www.instagram.com/la.productora/?hl=es",
      website: "laproductora.com.ar",
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bio: "Fiestas electrónicas en Buenos Aires.", instagram: "la.productora", website: "https://laproductora.com.ar" });

    expect((await agent.patch("/organizer/profile").send({ instagram: "@otra_cuenta" })).body.instagram).toBe("otra_cuenta");
    expect((await agent.patch("/organizer/profile").send({ website: "javascript:alert(1)" })).status).toBe(400);
    expect((await agent.patch("/organizer/profile").send({ instagram: "no válido!" })).status).toBe(400);
    expect((await agent.patch("/organizer/profile").send({ bio: "", website: "" })).body).toMatchObject({ bio: null, website: null });
  });

  it("la página pública muestra sus eventos a la venta y nunca el email", async () => {
    const { agent, eventId } = await createPublishedEvent();
    await draftEvent(agent, "Borrador secreto");
    await agent.patch("/organizer/profile").send({ bio: "Hola", instagram: "@prod" });
    const { organizerId } = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });

    const res = await request(app).get(`/organizers/${organizerId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Org", bio: "Hola", instagram: "prod" });
    expect(res.body.events.map((e: { name: string }) => e.name)).toEqual(["Recital de prueba"]);
    expect(JSON.stringify(res.body)).not.toContain("@example.com");

    const event = (await request(app).get(`/events/${eventId}`)).body;
    expect(event.organizer).toEqual({ id: organizerId, name: "Org" });
  });

  it("un organizador suspendido no tiene página", async () => {
    const { eventId } = await createPublishedEvent();
    const { organizerId } = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    await prisma.user.update({ where: { id: organizerId! }, data: { suspendedAt: new Date() } });
    expect((await request(app).get(`/organizers/${organizerId}`)).status).toBe(404);
    expect((await request(app).get("/organizers/no-existe")).status).toBe(404);
  });

  it("el link del perfil tiene vista previa para compartir", async () => {
    const { agent, eventId } = await createPublishedEvent();
    await agent.patch("/organizer/profile").send({ bio: "Las mejores fiestas" });
    const { organizerId } = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const html = (await request(app).get(`/organizador.html?id=${organizerId}`)).text;
    expect(html).toContain('<meta property="og:title" content="Org en ecko">');
    expect(html).toContain('<meta property="og:description" content="Las mejores fiestas">');
  });
});
