import { existsSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { admin, app, draftEvent, organizer } from "./helpers.js";

// PNG de 1x1 píxel.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010806000000" +
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082",
  "hex",
);

function upload(agent: ReturnType<typeof request.agent>, eventId: string, body: Buffer, type = "image/png") {
  return agent.put(`/organizer/events/${eventId}/image`).set("content-type", type).send(body);
}

describe("flyer de los eventos", () => {
  it("sube el flyer, se ve en la cartelera y se sirve desde /media", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const res = await upload(org, eventId, PNG);
    expect(res.status).toBe(200);
    expect(res.body.imageFile).toMatch(/^[0-9a-f]{32}\.png$/);

    await org.post(`/organizer/events/${eventId}/publish`);
    const publicEvent = await request(app).get(`/events/${eventId}`);
    expect(publicEvent.body.imageFile).toBe(res.body.imageFile);

    const media = await request(app).get(`/media/${res.body.imageFile}`);
    expect(media.status).toBe(200);
    expect(media.headers["content-type"]).toBe("image/png");
  });

  it("rechaza archivos que no son imágenes aunque digan serlo", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const res = await upload(org, eventId, Buffer.from("<script>alert(1)</script>"), "image/png");
    expect(res.status).toBe(400);
  });

  it("rechaza imágenes de más de 5 MB", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
    const res = await upload(org, eventId, big);
    expect(res.status).toBe(413);
    expect(res.body.error).toContain("5 MB");
  });

  it("al reemplazar o borrar el flyer, se elimina el archivo anterior", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const first = (await upload(org, eventId, PNG)).body.imageFile;
    const second = (await upload(org, eventId, PNG)).body.imageFile;
    expect(existsSync(path.join(config.uploadDir, first))).toBe(false);
    expect(existsSync(path.join(config.uploadDir, second))).toBe(true);

    expect((await org.delete(`/organizer/events/${eventId}/image`)).status).toBe(200);
    expect(existsSync(path.join(config.uploadDir, second))).toBe(false);
  });

  it("no se puede cambiar el flyer de un evento ajeno ni de uno en revisión", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org);
    const other = await organizer("otro@example.com");
    expect((await upload(other, eventId, PNG)).status).toBe(404);

    await org.post(`/organizer/events/${eventId}/publish`);
    expect((await upload(org, eventId, PNG)).status).toBe(409);

    // El administrador ve el flyer al revisar.
    const adm = await admin();
    expect((await adm.get("/admin/events")).body[0]).toHaveProperty("imageFile");
  });

  it("no sirve archivos fuera de la carpeta de subidas", async () => {
    const res = await request(app).get("/media/..%2Fpackage.json");
    expect(res.status).not.toBe(200);
  });
});
