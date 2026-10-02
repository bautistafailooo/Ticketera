import { EVENT_STATUS, api, escapeHtml, eventImage, formatDate, formatPrice, setupPanelPage } from "/js/common.js";

const user = await setupPanelPage();
const message = document.getElementById("message");
const pendingEl = document.getElementById("pending");
const eventsEl = document.getElementById("events");
const organizersEl = document.getElementById("organizers");
const revocationsEl = document.getElementById("revocations");

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const button = (label, action, id, secondary = false) =>
  `<button type="button" class="btn btn-small${secondary ? " btn-secondary" : ""}" data-action="${action}" data-id="${escapeHtml(id)}">${label}</button>`;

function organizerLabel(o) {
  return `${escapeHtml(o.name)} <span class="muted">(${escapeHtml(o.email)})</span>`;
}

function renderPending(events) {
  const pending = events.filter((e) => e.status === "PENDING_REVIEW");
  document.getElementById("pending-count").textContent = pending.length ? `${pending.length} pendientes` : "";
  if (pending.length === 0) {
    pendingEl.innerHTML = '<div class="empty">No hay eventos esperando revisión. ✓</div>';
    return;
  }
  pendingEl.innerHTML = pending.map((e) => `
    <article class="card review-card">
      <div class="thumb">${eventImage(e)}</div>
      <div>
        <div class="when" style="color: var(--accent); font-weight: 700">${escapeHtml(formatDate(e.startsAt))} h</div>
        <h3 style="margin: 4px 0">${escapeHtml(e.name)}</h3>
        <div class="muted">${escapeHtml(e.venue)}${e.address ? ` · ${escapeHtml(e.address)}` : ""}</div>
        ${e.description ? `<p style="margin-top: 12px; white-space: pre-line">${escapeHtml(e.description)}</p>` : ""}
        <p class="small" style="margin-top: 12px">Organizador: ${organizerLabel(e.organizer)}</p>
        <ul>
          ${e.ticketTypes.map((t) => `<li>${escapeHtml(t.name)}: ${formatPrice(t.priceCents)} × ${t.capacity}</li>`).join("")}
        </ul>
        <div class="form-actions">
          ${button("Aprobar", "approve-event", e.id)}
          ${button("Rechazar", "reject-event", e.id, true)}
        </div>
      </div>
    </article>`).join("");
}

function renderEvents(events) {
  const others = events.filter((e) => e.status !== "PENDING_REVIEW");
  if (others.length === 0) {
    eventsEl.innerHTML = '<p class="muted">Todavía no hay eventos publicados.</p>';
    return;
  }
  eventsEl.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Evento</th><th>Fecha</th><th>Organizador</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${others.map((e) => `
          <tr>
            <td class="wrap"><a href="/evento.html?id=${encodeURIComponent(e.id)}" style="color: var(--text)">${escapeHtml(e.name)}</a>${e.reviewNote ? `<div class="faint small">${escapeHtml(e.reviewNote)}</div>` : ""}</td>
            <td>${escapeHtml(dateFormatter.format(new Date(e.startsAt)))}</td>
            <td>${escapeHtml(e.organizer?.name ?? "—")}${e.organizer?.suspendedAt ? '<div class="error small">Suspendido: no aparece en la cartelera</div>' : ""}</td>
            <td><span class="badge ${escapeHtml(e.status)}">${EVENT_STATUS[e.status]}</span></td>
            <td><div class="row-actions">
              ${e.status === "PUBLISHED" ? button("Pausar", "pause-event", e.id, true) : ""}
              ${e.status === "PAUSED" ? button("Reactivar", "resume-event", e.id) : ""}
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function organizerStatus(o) {
  if (o.role === "ADMIN") return '<span class="badge PUBLISHED">Admin</span>';
  if (o.suspendedAt) return '<span class="badge danger">Suspendido</span>';
  if (o.trustedAt) return '<span class="badge PUBLISHED">Confiable</span>';
  return '<span class="badge warn">Con revisión</span>';
}

function organizerActions(o) {
  if (o.role === "ADMIN") return "";
  return [
    o.trustedAt ? button("Quitar confianza", "untrust", o.id, true) : button("Marcar confiable", "trust", o.id),
    o.suspendedAt ? button("Reactivar cuenta", "unsuspend", o.id) : button("Suspender", "suspend", o.id, true),
  ].join("");
}

function renderOrganizers(users) {
  organizersEl.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Organizador</th><th>Alta</th><th class="num">Eventos</th><th>Estado</th><th>Mercado Pago</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td class="wrap">${escapeHtml(u.name)}<div class="faint small">${escapeHtml(u.email)}</div></td>
            <td>${escapeHtml(dateFormatter.format(new Date(u.createdAt)))}</td>
            <td class="num">${u._count.events}</td>
            <td>${organizerStatus(u)}</td>
            <td>${u.mpConnectedAt ? '<span class="badge ok">Conectado</span>' : '<span class="faint small">Sin conectar</span>'}</td>
            <td><div class="row-actions">${organizerActions(u)}</div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

function renderRevocations(requests) {
  const open = requests.filter((r) => !r.resolvedAt).length;
  document.getElementById("revocations-count").textContent = open ? `${open} sin resolver` : "";
  if (requests.length === 0) {
    revocationsEl.innerHTML = '<p class="muted">No hay pedidos.</p>';
    return;
  }
  revocationsEl.innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Código</th><th>Fecha</th><th>Comprador</th><th>Compra</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${requests.map((r) => `
          <tr>
            <td class="mono">${escapeHtml(r.code)}</td>
            <td>${escapeHtml(dateFormatter.format(new Date(r.createdAt)))}</td>
            <td class="wrap">${escapeHtml(r.name)}<div class="faint small">${escapeHtml(r.email)}</div>${r.reason ? `<div class="small">${escapeHtml(r.reason)}</div>` : ""}</td>
            <td class="wrap">${r.order
              ? `${escapeHtml(r.order.event.name)}<div class="faint small">${formatPrice(r.order.totalCents)} · compra del ${escapeHtml(dateFormatter.format(new Date(r.order.createdAt)))}${r.order.event.organizer ? ` · organiza ${escapeHtml(r.order.event.organizer.name)} (${escapeHtml(r.order.event.organizer.email)})` : ""}</div>`
              : `<span class="faint">No identificada</span>${r.reference ? `<div class="faint small">${escapeHtml(r.reference)}</div>` : ""}`}</td>
            <td>${r.resolvedAt
              ? `<span class="badge ok">Resuelto</span>${r.resolutionNote ? `<div class="faint small">${escapeHtml(r.resolutionNote)}</div>` : ""}`
              : '<span class="badge warn">Pendiente</span>'}</td>
            <td><div class="row-actions">${r.resolvedAt ? "" : button("Marcar resuelto", "resolve-revocation", r.id)}</div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;
}

async function load() {
  try {
    const [events, users, revocations] = await Promise.all([api("/admin/events"), api("/admin/organizers"), api("/admin/arrepentimientos")]);
    renderPending(events);
    renderEvents(events);
    renderOrganizers(users);
    renderRevocations(revocations);
  } catch (err) {
    message.textContent = err.message;
  }
}

// Qué hace cada botón: ruta y, si corresponde, qué preguntar antes.
const ACTIONS = {
  "approve-event": { path: (id) => `/admin/events/${id}/approve` },
  "reject-event": { path: (id) => `/admin/events/${id}/reject`, note: "¿Por qué lo rechazás? El organizador va a ver este motivo." },
  "pause-event": { path: (id) => `/admin/events/${id}/pause`, note: "¿Por qué lo pausás? El organizador va a ver este motivo." },
  "resume-event": { path: (id) => `/admin/events/${id}/resume` },
  trust: { path: (id) => `/admin/organizers/${id}/trust` },
  untrust: { path: (id) => `/admin/organizers/${id}/untrust` },
  suspend: {
    path: (id) => `/admin/organizers/${id}/suspend`,
    confirm: "Todos sus eventos van a salir de la cartelera y no va a poder publicar. ¿Continuar?",
  },
  unsuspend: { path: (id) => `/admin/organizers/${id}/unsuspend` },
  "resolve-revocation": {
    path: (id) => `/admin/arrepentimientos/${id}/resolve`,
    note: "¿Cómo se resolvió? Ej.: devolución hecha por Mercado Pago el 3/10, o compra fuera de plazo (respondido por mail).",
  },
};

document.querySelector("main").addEventListener("click", async (e) => {
  const target = e.target.closest("button[data-action]");
  if (!target) return;
  const action = ACTIONS[target.dataset.action];
  let body;
  if (action.note) {
    const note = prompt(action.note);
    if (note === null) return;
    if (!note.trim()) {
      message.textContent = "Tenés que escribir un motivo.";
      return;
    }
    body = JSON.stringify({ note });
  }
  if (action.confirm && !confirm(action.confirm)) return;
  target.disabled = true;
  message.textContent = "";
  try {
    await api(action.path(encodeURIComponent(target.dataset.id)), { method: "POST", body });
    await load();
  } catch (err) {
    message.textContent = err.message;
    target.disabled = false;
  }
});

if (user.role !== "ADMIN") {
  document.querySelector("main").innerHTML = '<p class="error">Esta página es solo para administradores.</p>';
} else {
  load();
}
