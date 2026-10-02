import {
  EVENT_STATUS,
  api,
  argentinaDate,
  argentinaLocalValue,
  escapeHtml,
  eventImage,
  formatDate,
  formatPrice,
  pesosToCents,
  resizeImage,
  setupPanelPage,
} from "/js/common.js";

const ORDER_STATUS = {
  PENDING: '<span class="badge warn">Pendiente</span>',
  PAID: '<span class="badge ok">Pagada</span>',
  CANCELLED: '<span class="badge danger">Cancelada</span>',
  EXPIRED: '<span class="badge">Vencida</span>',
};
const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

const user = await setupPanelPage();

const content = document.getElementById("content");
const eventId = new URLSearchParams(location.search).get("id");
const eventPath = `/organizer/events/${encodeURIComponent(eventId)}`;

async function load() {
  try {
    render(await api(eventPath));
  } catch (err) {
    content.innerHTML = `<div class="empty"><p class="error">${escapeHtml(err.message)}</p><a class="btn btn-secondary" href="/panel.html">Volver a mis eventos</a></div>`;
  }
}

// Pasos que faltan para que un borrador pueda salir a la venta.
function checklist(event) {
  const steps = [
    { done: true, text: "Cargar los datos del evento" },
    { done: Boolean(event.imageFile), text: "Subir el flyer (recomendado)" },
    { done: event.ticketTypes.length > 0, text: "Agregar al menos un tipo de entrada" },
    { done: false, text: user.trusted ? "Publicar el evento" : "Enviarlo a revisión" },
  ];
  return `
    <section class="card">
      <h2>Para ponerlo a la venta</h2>
      <ol style="margin: 8px 0 0; padding-left: 20px">
        ${steps.map((s) => `<li class="${s.done ? "faint" : ""}" style="padding: 4px 0">${s.done ? "✓ " : ""}${s.text}</li>`).join("")}
      </ol>
    </section>`;
}

function render(event) {
  document.title = `${event.name} · Panel`;
  const t = event.totals;
  const canSubmit = event.status === "DRAFT" || event.status === "REJECTED";
  const submitLabel = user.trusted ? "Publicar evento" : "Enviar a revisión";
  const reviewNote = event.reviewNote && (event.status === "REJECTED" || event.status === "PAUSED")
    ? `<p class="notice danger"><span><strong>${event.status === "REJECTED" ? "Motivo del rechazo" : "Motivo de la pausa"}:</strong> ${escapeHtml(event.reviewNote)}</span></p>`
    : "";

  const LOT_STATUS = {
    onsale: '<span class="badge ok">A la venta</span>',
    soldout: '<span class="badge danger">Agotado</span>',
    ended: '<span class="badge">Finalizó</span>',
    upcoming: '<span class="badge warn">Próximamente</span>',
  };
  const lotInfo = (tt) => [
    tt.opensAfterName ? `Después de ${escapeHtml(tt.opensAfterName)}` : "",
    tt.salesEndAt ? `Hasta ${escapeHtml(formatDate(tt.salesEndAt))} h` : "",
  ].filter(Boolean).join(" · ");
  const ticketRows = event.ticketTypes.map((tt) => `
    <tr>
      <td class="wrap">${escapeHtml(tt.name)}${lotInfo(tt) ? `<div class="faint small">${lotInfo(tt)}</div>` : ""}</td>
      <td>${LOT_STATUS[tt.status] ?? ""}</td>
      <td class="num">${formatPrice(tt.priceCents)}</td>
      <td class="num">${tt.sold} / ${tt.capacity}</td>
      <td class="num">${tt.paid}</td>
      <td class="num">${tt.courtesy}</td>
      <td class="num">${tt.checkedIn}</td>
      <td class="num">${formatPrice(tt.revenueCents)}</td>
      ${event.editable ? `<td><div class="row-actions">
        <button type="button" class="btn btn-secondary btn-small" data-edit-type="${escapeHtml(tt.id)}">Editar</button>
        ${tt.sold === 0 && tt.paid === 0 && tt.courtesy === 0 ? `<button type="button" class="btn btn-secondary btn-small" data-delete-type="${escapeHtml(tt.id)}">Borrar</button>` : ""}
      </div></td>` : ""}
    </tr>`).join("");

  const orderRows = event.orders.map((o) => `
    <tr>
      <td>${escapeHtml(timeFormatter.format(new Date(o.createdAt)))}</td>
      <td class="wrap">${escapeHtml(o.buyerName)}<div class="faint small">${escapeHtml(o.buyerEmail)}</div></td>
      <td class="num">${o._count.tickets}</td>
      <td class="num">${formatPrice(o.totalCents)}</td>
      <td>${o.complimentary ? '<span class="badge">Cortesía</span>' : o.refundedAt ? '<span class="badge danger">Devuelta</span>' : (ORDER_STATUS[o.status] ?? escapeHtml(o.status))}</td>
    </tr>`).join("");

  const doorUrl = event.doorToken ? `${location.origin}/puerta.html#${event.doorToken}` : "";

  content.innerHTML = `
    <a class="back" href="/panel.html">← Mis eventos</a>

    <div class="admin-head">
      <div class="thumb">${eventImage(event)}</div>
      <div>
        <span class="badge ${escapeHtml(event.status)}">${EVENT_STATUS[event.status]}</span>
        <h1 style="margin: 8px 0 4px">${escapeHtml(event.name)}</h1>
        <div class="muted">${escapeHtml(formatDate(event.startsAt))} h · ${escapeHtml(event.venue)}${event.address ? ` · ${escapeHtml(event.address)}` : ""}</div>
        <p class="visibility ${event.visibility.visible ? "ok" : ""}">
          ${event.visibility.visible ? "Visible en la cartelera" : `No aparece en la cartelera: ${escapeHtml(event.visibility.reason)}`}
        </p>
      </div>
      <div class="form-actions" style="margin: 0">
        ${canSubmit ? `<button type="button" class="btn btn-gradient" id="publish">${submitLabel}</button>` : ""}
        ${event.visibility.visible ? `<a class="btn btn-secondary" href="/evento.html?id=${encodeURIComponent(event.id)}">Ver en la cartelera</a>` : ""}
      </div>
    </div>
    <p id="publish-message" class="error" role="alert"></p>
    ${reviewNote}

    <div class="stats">
      <div class="card stat"><div class="value">${t.sold} / ${t.capacity}</div><div class="label">${t.courtesy ? "Entradas emitidas" : "Entradas vendidas"}</div></div>
      <div class="card stat"><div class="value">${t.paid}</div><div class="label">Pagas</div></div>
      ${t.courtesy ? `<div class="card stat"><div class="value">${t.courtesy}</div><div class="label">Cortesías</div></div>` : ""}
      <div class="card stat"><div class="value">${formatPrice(t.revenueCents)}</div><div class="label">Recaudado</div></div>
      <div class="card stat"><div class="value">${t.checkedIn}</div><div class="label">Ingresaron</div></div>
    </div>

    <div class="stack">
      ${canSubmit ? checklist(event) : ""}

      <section class="card">
        <h2>Flyer</h2>
        <div class="image-editor">
          <div class="preview" id="image-preview">${eventImage(event)}</div>
          <div>
            <p class="muted">Es la imagen que se ve en la cartelera y en la página del evento. Funciona mejor vertical (4:5), por ejemplo 1080 × 1350.</p>
            ${event.editable ? `
              <div class="form-actions">
                <label class="btn btn-secondary" style="margin: 0; color: var(--text)">
                  ${event.imageFile ? "Cambiar imagen" : "Subir imagen"}
                  <input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" hidden>
                </label>
                ${event.imageFile ? '<button type="button" class="btn btn-danger" id="image-remove">Quitar</button>' : ""}
              </div>
              <p class="field-hint">JPG, PNG o WebP. La achicamos automáticamente antes de subirla.</p>`
              : '<p class="faint small">El flyer no se puede cambiar mientras el evento está en revisión o después de aprobado.</p>'}
            <p id="image-message" class="error" role="alert" style="margin: 8px 0 0"></p>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Tipos de entrada</h2>
        ${event.ticketTypes.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Tipo</th><th>Venta</th><th class="num">Precio</th><th class="num">Vendidas</th><th class="num">Pagas</th><th class="num">Cortesías</th><th class="num">Ingresaron</th><th class="num">Recaudado</th>${event.editable ? "<th></th>" : ""}</tr></thead>
              <tbody>${ticketRows}</tbody>
            </table></div>`
          : '<p class="muted">Todavía no hay tipos de entrada. Agregá al menos uno para poder publicar.</p>'}

        <form id="new-ticket-type" ${event.editable ? "" : "hidden"}>
          <h3 style="margin-top: 24px" id="tt-title">Agregar tipo de entrada</h3>
          <div class="form-row">
            <div><label for="tt-name">Nombre</label><input id="tt-name" required maxlength="60" placeholder="Campo, Platea, VIP…"></div>
            <div><label for="tt-price">Precio ($)</label><input id="tt-price" required inputmode="decimal" placeholder="35.000"></div>
            <div><label for="tt-capacity">Cantidad</label><input id="tt-capacity" type="number" min="1" step="1" required placeholder="500"></div>
          </div>
          <p class="field-hint">Poné 0 como precio para entradas gratis.</p>
          <details class="lot-options">
            <summary>Preventa o lotes <span class="faint">(opcional)</span></summary>
            <p class="field-hint">Para vender por tandas: por ejemplo "Early bird" hasta el viernes y después "Primera tanda", que se habilita sola cuando el early bird se agota o vence.</p>
            <div class="form-row">
              <div><label for="tt-sales-end">Venta hasta</label><input id="tt-sales-end" type="datetime-local"></div>
              <div><label for="tt-opens-after">Se habilita cuando termina</label>
                <select id="tt-opens-after">
                  <option value="">— Desde que se publica —</option>
                  ${event.ticketTypes.map((tt) => `<option value="${escapeHtml(tt.id)}">${escapeHtml(tt.name)}</option>`).join("")}
                </select>
              </div>
            </div>
          </details>
          <div class="form-actions">
            <button type="submit" class="btn btn-secondary" id="tt-submit">Agregar</button>
            <button type="button" class="btn btn-secondary" id="tt-cancel" hidden>Cancelar</button>
          </div>
          <p id="tt-message" class="error" role="alert" style="margin: 12px 0 0"></p>
        </form>
      </section>

      ${event.ticketTypes.length && event.status !== "CANCELLED" && new Date(event.startsAt) > new Date() ? `
      <form class="card" id="courtesy">
        <h2>Cortesías</h2>
        <p class="muted">Entradas gratis para invitados: le llegan por mail con su QR, como cualquier entrada, y ocupan lugar.</p>
        <div class="form-row">
          <div><label for="ct-name">Nombre del invitado</label><input id="ct-name" required maxlength="100"></div>
          <div><label for="ct-email">Email</label><input id="ct-email" type="email" required maxlength="200"></div>
        </div>
        <div class="form-row">
          <div><label for="ct-type">Tipo de entrada</label>
            <select id="ct-type">${event.ticketTypes.map((tt) => `<option value="${escapeHtml(tt.id)}">${escapeHtml(tt.name)} (quedan ${Math.max(0, tt.capacity - tt.sold)})</option>`).join("")}</select>
          </div>
          <div><label for="ct-quantity">Cantidad</label><input id="ct-quantity" type="number" min="1" max="10" step="1" value="1" required></div>
        </div>
        <div class="form-actions"><button type="submit" class="btn btn-secondary" id="ct-submit">Mandar invitación</button></div>
        <p id="ct-message" role="status" style="margin: 12px 0 0"></p>
      </form>` : ""}

      ${event.editable ? `
      <form class="card" id="edit-event">
        <h2>Datos del evento</h2>
        ${user.trusted ? "" : '<p class="muted small">Los cambios se pueden hacer mientras el evento no esté aprobado.</p>'}
        <label for="ev-name">Nombre</label>
        <input id="ev-name" required maxlength="120" value="${escapeHtml(event.name)}">
        <label for="ev-description">Descripción</label>
        <textarea id="ev-description" maxlength="2000">${escapeHtml(event.description ?? "")}</textarea>
        <div class="form-row">
          <div><label for="ev-venue">Lugar</label><input id="ev-venue" required maxlength="200" value="${escapeHtml(event.venue)}"></div>
          <div><label for="ev-startsAt">Fecha y hora</label><input id="ev-startsAt" type="datetime-local" required value="${argentinaLocalValue(event.startsAt)}"></div>
        </div>
        <label for="ev-address">Dirección <span class="faint">(opcional)</span></label>
        <input id="ev-address" maxlength="200" placeholder="Ej: Av. del Libertador 7395, CABA" value="${escapeHtml(event.address ?? "")}">
        <p class="field-hint">Con la dirección, la página del evento muestra un mapa y el botón "Cómo llegar".</p>
        <div class="form-actions"><button type="submit" class="btn btn-secondary">Guardar cambios</button></div>
        <p id="ev-message" class="error" role="alert" style="margin: 12px 0 0"></p>
      </form>` : ""}

      <section class="card">
        <h2>Control de acceso</h2>
        ${event.doorToken
          ? `<p class="muted">Pasale este link al personal de puerta. Con él validan las entradas de este evento desde el celular, sin crear una cuenta.</p>
            <div class="link-box">
              <input id="door-link" readonly value="${escapeHtml(doorUrl)}" aria-label="Link de puerta">
              <button type="button" id="copy-door" class="btn btn-secondary">Copiar</button>
            </div>
            <div class="form-actions">
              <a class="btn" href="/puerta.html#${encodeURIComponent(event.doorToken)}" target="_blank" rel="noopener">Abrir app de puerta</a>
              <button type="button" id="door-token" class="link-button">Regenerar link</button>
            </div>`
          : `<p class="muted">Generá un link para que el personal de puerta valide las entradas desde el celular.</p>
            <div class="form-actions"><button type="button" class="btn btn-secondary" id="door-token">Generar link de puerta</button></div>`}
        <p id="door-message" class="error" role="alert" style="margin: 12px 0 0"></p>
      </section>

      <section class="card">
        <h2>Últimas órdenes</h2>
        ${event.orders.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Fecha</th><th>Comprador</th><th class="num">Entradas</th><th class="num">Total</th><th>Estado</th></tr></thead>
              <tbody>${orderRows}</tbody>
            </table></div>`
          : '<p class="muted">Todavía no hay compras.</p>'}
      </section>
    </div>`;

  bind(event);
}

function bind(event) {
  const on = (id, type, handler) => document.getElementById(id)?.addEventListener(type, handler);

  on("publish", "click", async (e) => {
    e.target.disabled = true;
    try {
      await api(`${eventPath}/publish`, { method: "POST" });
      await load();
    } catch (err) {
      document.getElementById("publish-message").textContent = err.message;
      e.target.disabled = false;
    }
  });

  on("image-input", "change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const message = document.getElementById("image-message");
    message.textContent = "";
    const preview = document.getElementById("image-preview");
    try {
      const blob = await resizeImage(file);
      const url = URL.createObjectURL(blob);
      preview.innerHTML = `<img class="flyer" src="${url}" alt="">`;
      preview.style.opacity = "0.5";
      const res = await fetch(`${eventPath}/image`, { method: "PUT", headers: { "content-type": blob.type }, body: blob });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo subir la imagen");
      URL.revokeObjectURL(url);
      await load();
    } catch (err) {
      preview.style.opacity = "";
      message.textContent = err.message === "The source image could not be decoded." ? "No pudimos leer esa imagen. Probá con otra." : err.message;
    }
  });

  on("image-remove", "click", async () => {
    if (!confirm("¿Quitar el flyer del evento?")) return;
    try {
      await api(`${eventPath}/image`, { method: "DELETE" });
      await load();
    } catch (err) {
      document.getElementById("image-message").textContent = err.message;
    }
  });

  on("copy-door", "click", async (e) => {
    const input = document.getElementById("door-link");
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
    }
    e.target.textContent = "¡Copiado!";
    setTimeout(() => (e.target.textContent = "Copiar"), 2000);
  });

  on("door-token", "click", async () => {
    if (event.doorToken && !confirm("El link actual va a dejar de funcionar. ¿Generar uno nuevo?")) return;
    try {
      await api(`${eventPath}/door-token`, { method: "POST" });
      await load();
    } catch (err) {
      document.getElementById("door-message").textContent = err.message;
    }
  });

  on("edit-event", "submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("ev-message");
    message.textContent = "";
    try {
      await api(eventPath, {
        method: "PATCH",
        body: JSON.stringify({
          name: document.getElementById("ev-name").value,
          description: document.getElementById("ev-description").value,
          venue: document.getElementById("ev-venue").value,
          address: document.getElementById("ev-address").value,
          startsAt: argentinaDate(document.getElementById("ev-startsAt").value),
        }),
      });
      await load();
    } catch (err) {
      message.textContent = err.message;
    }
  });

  on("courtesy", "submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("ct-message");
    const button = document.getElementById("ct-submit");
    button.disabled = true;
    message.className = "";
    message.textContent = "";
    try {
      const res = await api(`${eventPath}/cortesias`, {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("ct-name").value,
          email: document.getElementById("ct-email").value,
          ticketTypeId: document.getElementById("ct-type").value,
          quantity: Number(document.getElementById("ct-quantity").value),
        }),
      });
      await load();
      const done = document.getElementById("ct-message");
      done.className = "success";
      done.textContent = `Listo: le mandamos ${res.quantity === 1 ? "la entrada" : `${res.quantity} entradas`} a ${res.email}.`;
    } catch (err) {
      message.className = "error";
      message.textContent = err.message;
      button.disabled = false;
    }
  });

  // El mismo formulario sirve para agregar y para editar un tipo de entrada.
  let editingType = null;
  const ticketForm = document.getElementById("new-ticket-type");
  const setEditing = (tt) => {
    editingType = tt;
    document.getElementById("tt-title").textContent = tt ? `Editar "${tt.name}"` : "Agregar tipo de entrada";
    document.getElementById("tt-submit").textContent = tt ? "Guardar cambios" : "Agregar";
    document.getElementById("tt-cancel").hidden = !tt;
    document.getElementById("tt-message").textContent = "";
    document.getElementById("tt-name").value = tt?.name ?? "";
    document.getElementById("tt-price").value = tt ? String(tt.priceCents / 100).replace(".", ",") : "";
    document.getElementById("tt-capacity").value = tt?.capacity ?? "";
    document.getElementById("tt-sales-end").value = tt?.salesEndAt ? argentinaLocalValue(tt.salesEndAt) : "";
    const select = document.getElementById("tt-opens-after");
    for (const option of select.options) option.hidden = Boolean(tt) && option.value === tt.id;
    select.value = tt?.opensAfterId ?? "";
    if (tt && (tt.salesEndAt || tt.opensAfterId)) ticketForm.querySelector(".lot-options").open = true;
    if (tt) ticketForm.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // En la sección (que se vuelve a dibujar en cada recarga), así el listener no se acumula.
  ticketForm.closest("section").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit-type]");
    if (edit) setEditing(event.ticketTypes.find((t) => t.id === edit.dataset.editType));
    const remove = e.target.closest("[data-delete-type]");
    if (remove) {
      const tt = event.ticketTypes.find((t) => t.id === remove.dataset.deleteType);
      if (!confirm(`¿Borrar "${tt.name}"?`)) return;
      try {
        await api(`${eventPath}/ticket-types/${encodeURIComponent(tt.id)}`, { method: "DELETE" });
        await load();
      } catch (err) {
        alert(err.message);
      }
    }
  });
  on("tt-cancel", "click", () => setEditing(null));

  on("new-ticket-type", "submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("tt-message");
    message.textContent = "";
    const salesEnd = document.getElementById("tt-sales-end").value;
    const opensAfter = document.getElementById("tt-opens-after").value;
    try {
      const fields = {
        name: document.getElementById("tt-name").value,
        priceCents: pesosToCents(document.getElementById("tt-price").value),
        capacity: Number(document.getElementById("tt-capacity").value),
      };
      if (editingType) {
        // Al editar, vaciar un campo de lote lo saca (null).
        await api(`${eventPath}/ticket-types/${encodeURIComponent(editingType.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ ...fields, salesEndAt: salesEnd ? argentinaDate(salesEnd) : null, opensAfterId: opensAfter || null }),
        });
      } else {
        await api(`${eventPath}/ticket-types`, {
          method: "POST",
          body: JSON.stringify({ ...fields, salesEndAt: salesEnd ? argentinaDate(salesEnd) : undefined, opensAfterId: opensAfter || undefined }),
        });
      }
      await load();
    } catch (err) {
      message.textContent = err.message;
    }
  });
}

if (eventId) load();
else content.innerHTML = '<div class="empty error">No se indicó el evento.</div>';
