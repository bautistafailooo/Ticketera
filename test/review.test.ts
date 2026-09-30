import request from "supertest";
import { describe, expect, it } from "vitest";
import { admin, app, buy, checkIn, doorToken, draftEvent, inDays, organizer, paidTickets } from "./helpers.js";

const publicIds = async () => (await request(app).get("/events")).body.map((e: { id: string }) => e.id);

describe("revisión de eventos", () => {
  it("un organizador no confiable envía el evento a revisión y no aparece hasta que se aprueba", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org);

    const sent = await org.post(`/organizer/events/${eventId}/publish`);
    expect(sent.body.status).toBe("PENDING_REVIEW");
    expect(await publicIds()).toEqual([]);
    const detail = await org.get(`/organizer/events/${eventId}`);
    expect(detail.body.visibility).toEqual({ visible: false, reason: "Esperando la revisión de un administrador" });

    const adm = await admin();
    const list = await adm.get("/admin/events");
    expect(list.body[0]).toMatchObject({ id: eventId, status: "PENDING_REVIEW" });
    expect((await adm.post(`/admin/events/${eventId}/approve`)).status).toBe(200);
    expect(await publicIds()).toEqual([eventId]);
  });

  it("un organizador confiable publica directo", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    expect((await org.post(`/organizer/events/${eventId}/publish`)).body.status).toBe("PUBLISHED");
    expect(await publicIds()).toEqual([eventId]);
  });

  it("un evento rechazado muestra el motivo, se corrige y se vuelve a enviar", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org);
    await org.post(`/organizer/events/${eventId}/publish`);

    // Mientras está en revisión no se puede modificar.
    expect((await org.patch(`/organizer/events/${eventId}`).send({ name: "Otro" })).status).toBe(409);

    const adm = await admin();
    expect((await adm.post(`/admin/events/${eventId}/reject`).send({})).status).toBe(400);
    await adm.post(`/admin/events/${eventId}/reject`).send({ note: "Falta el nombre real del lugar" });

    const rejected = await org.get(`/organizer/events/${eventId}`);
    expect(rejected.body).toMatchObject({ status: "REJECTED", reviewNote: "Falta el nombre real del lugar", editable: true });

    const edited = await org.patch(`/organizer/events/${eventId}`).send({ venue: "Club Atlético Sur" });
    expect(edited.body.venue).toBe("Club Atlético Sur");
    expect((await org.post(`/organizer/events/${eventId}/publish`)).body.status).toBe("PENDING_REVIEW");
    expect((await adm.post(`/admin/events/${eventId}/approve`)).status).toBe(200);
    expect(await publicIds()).toEqual([eventId]);
  });

  it("un organizador no confiable no puede cambiar un evento ya aprobado", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org);
    await org.post(`/organizer/events/${eventId}/publish`);
    await (await admin()).post(`/admin/events/${eventId}/approve`);

    expect((await org.patch(`/organizer/events/${eventId}`).send({ name: "Cambiado" })).status).toBe(409);
    const tt = await org.post(`/organizer/events/${eventId}/ticket-types`).send({ name: "Extra", priceCents: 1, capacity: 1 });
    expect(tt.status).toBe(409);
  });

  it("un organizador confiable puede editar su evento publicado", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    await org.post(`/organizer/events/${eventId}/publish`);
    const res = await org.patch(`/organizer/events/${eventId}`).send({ startsAt: inDays(40) });
    expect(res.status).toBe(200);
  });

  it("no se editan eventos ajenos ni con fechas pasadas", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const other = await organizer("otro@example.com");
    expect((await other.patch(`/organizer/events/${eventId}`).send({ name: "Mío" })).status).toBe(404);
    expect((await org.patch(`/organizer/events/${eventId}`).send({ startsAt: inDays(-1) })).status).toBe(400);
  });

  it("el administrador pausa un evento puntual con un motivo y lo reactiva", async () => {
    const org = await organizer();
    const a = await draftEvent(org, "Evento A");
    const b = await draftEvent(org, "Evento B");
    await org.post(`/organizer/events/${a.eventId}/publish`);
    await org.post(`/organizer/events/${b.eventId}/publish`);
    const token = await doorToken(org, a.eventId);
    const [code] = await paidTickets(a.ticketTypeId);

    const adm = await admin();
    await adm.post(`/admin/events/${a.eventId}/pause`).send({ note: "Denuncia de un comprador" });
    expect(await publicIds()).toEqual([b.eventId]);
    expect((await buy(a.ticketTypeId, 1)).status).toBe(409);

    const detail = await org.get(`/organizer/events/${a.eventId}`);
    expect(detail.body).toMatchObject({ status: "PAUSED", reviewNote: "Denuncia de un comprador" });
    expect((await org.post(`/organizer/events/${a.eventId}/publish`)).status).toBe(409);

    // Las entradas ya vendidas siguen valiendo en la puerta.
    expect((await checkIn(token, code)).status).toBe(200);

    await adm.post(`/admin/events/${a.eventId}/resume`);
    expect((await publicIds()).sort()).toEqual([a.eventId, b.eventId].sort());
  });

  it("un organizador suspendido no puede publicar", async () => {
    const org = await organizer();
    const { eventId } = await draftEvent(org);
    const me = (await org.get("/auth/me")).body;
    await (await admin()).post(`/admin/organizers/${me.id}/suspend`);
    expect((await org.post(`/organizer/events/${eventId}/publish`)).status).toBe(403);
  });

  it("solo un administrador revisa eventos", async () => {
    const org = await organizer("nuevo@example.com", { trusted: false });
    const { eventId } = await draftEvent(org);
    await org.post(`/organizer/events/${eventId}/publish`);
    expect((await org.post(`/admin/events/${eventId}/approve`)).status).toBe(403);
    expect((await org.get("/admin/events")).status).toBe(403);
  });
});
