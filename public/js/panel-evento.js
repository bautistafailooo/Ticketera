import { api, escapeHtml, formatDate, formatPrice, pesosToCents, setupPanelPage } from "/js/common.js";

const STATUS = { DRAFT: "Borrador", PUBLISHED: "Publicado", CANCELLED: "Cancelado" };
const ORDER_STATUS = { PENDING: "Pendiente de pago", PAID: "Pagada", CANCELLED: "Cancelada", EXPIRED: "Vencida" };
const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

await setupPanelPage();

const content = document.getElementById("content");
const eventId = new URLSearchParams(location.search).get("id");

async function load() {
  try {
    render(await api(`/organizer/events/${encodeURIComponent(eventId)}`));
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

function render(event) {
  document.title = `${event.name} · Panel · Ticketera`;
  const t = event.totals;
  const ticketRows = event.ticketTypes.map((tt) => `
    <tr>
      <td>${escapeHtml(tt.name)}</td>
      <td class="num">${formatPrice(tt.priceCents)}</td>
      <td class="num">${tt.sold} / ${tt.capacity}</td>
      <td class="num">${tt.paid}</td>
      <td class="num">${tt.checkedIn}</td>
      <td class="num">${formatPrice(tt.revenueCents)}</td>
    </tr>`).join("");
  const orderRows = event.orders.map((o) => `
    <tr>
      <td>${escapeHtml(timeFormatter.format(new Date(o.createdAt)))}</td>
      <td>${escapeHtml(o.buyerName)}<div class="muted">${escapeHtml(o.buyerEmail)}</div></td>
      <td class="num">${o._count.tickets}</td>
      <td class="num">${formatPrice(o.totalCents)}</td>
      <td>${ORDER_STATUS[o.status]}</td>
    </tr>`).join("");

  content.innerHTML = `
    <div class="page-head">
      <div>
        <span class="badge ${event.status}">${STATUS[event.status]}</span>
        <h1 style="margin-top: 8px">${escapeHtml(event.name)}</h1>
        <div class="muted">${escapeHtml(formatDate(event.startsAt))} · ${escapeHtml(event.venue)}</div>
      </div>
      ${event.status === "DRAFT"
        ? '<button type="button" id="publish">Publicar evento</button>'
        : event.status === "PUBLISHED"
          ? `<a href="/evento.html?id=${encodeURIComponent(event.id)}">Ver en la cartelera →</a>`
          : ""}
    </div>
    <p id="publish-message" class="error" role="alert"></p>

    <div class="stats">
      <div class="card stat"><div class="value">${t.sold} / ${t.capacity}</div><div class="label">Entradas vendidas</div></div>
      <div class="card stat"><div class="value">${t.paid}</div><div class="label">Pagas</div></div>
      <div class="card stat"><div class="value">${formatPrice(t.revenueCents)}</div><div class="label">Recaudado</div></div>
      <div class="card stat"><div class="value">${t.checkedIn}</div><div class="label">Ingresaron</div></div>
    </div>

    <section class="card">
      <h2>Tipos de entrada</h2>
      ${event.ticketTypes.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Tipo</th><th class="num">Precio</th><th class="num">Vendidas</th><th class="num">Pagas</th><th class="num">Ingresaron</th><th class="num">Recaudado</th></tr></thead>
            <tbody>${ticketRows}</tbody>
          </table></div>`
        : '<p class="muted">Agregá al menos un tipo de entrada para poder publicar el evento.</p>'}

      <form id="new-ticket-type">
        <h3 style="margin-top: 24px">Agregar tipo de entrada</h3>
        <div class="form-row">
          <div><label for="tt-name">Nombre</label><input id="tt-name" required placeholder="Campo, Platea, VIP…"></div>
          <div><label for="tt-price">Precio ($)</label><input id="tt-price" required inputmode="decimal" placeholder="35000"></div>
          <div><label for="tt-capacity">Cantidad</label><input id="tt-capacity" type="number" min="1" step="1" required placeholder="500"></div>
        </div>
        <button type="submit" class="button-secondary">Agregar</button>
        <p id="tt-message" class="error" role="alert"></p>
      </form>
    </section>

    <section class="card">
      <h2>Control de acceso</h2>
      ${event.doorToken
        ? `<p class="muted">Pasale este link al personal de puerta. Con él pueden validar entradas de este evento desde el celular, sin crear una cuenta.</p>
          <div class="door-link">
            <input id="door-link" readonly value="${escapeHtml(`${location.origin}/puerta.html#${event.doorToken}`)}" aria-label="Link de puerta">
            <button type="button" id="copy-door" class="button-secondary">Copiar</button>
          </div>
          <div class="actions">
            <a href="/puerta.html#${encodeURIComponent(event.doorToken)}" target="_blank" rel="noopener">Abrir app de puerta →</a>
            <button type="button" id="door-token" class="link-button">Regenerar link</button>
          </div>`
        : `<p class="muted">Generá un link para que el personal de puerta valide las entradas desde el celular.</p>
          <div class="actions"><button type="button" id="door-token">Generar link de puerta</button></div>`}
      <p id="door-message" class="error" role="alert"></p>
    </section>

    <section class="card">
      <h2>Últimas órdenes</h2>
      ${event.orders.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Fecha</th><th>Comprador</th><th class="num">Entradas</th><th class="num">Total</th><th>Estado</th></tr></thead>
            <tbody>${orderRows}</tbody>
          </table></div>`
        : '<p class="muted">Todavía no hay compras.</p>'}
    </section>`;

  document.getElementById("publish")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await api(`/organizer/events/${encodeURIComponent(event.id)}/publish`, { method: "POST" });
      await load();
    } catch (err) {
      document.getElementById("publish-message").textContent = err.message;
      e.target.disabled = false;
    }
  });

  document.getElementById("copy-door")?.addEventListener("click", async (e) => {
    const input = document.getElementById("door-link");
    try {
      await navigator.clipboard.writeText(input.value);
    } catch {
      input.select();
      document.execCommand("copy");
    }
    e.target.textContent = "¡Copiado!";
    setTimeout(() => (e.target.textContent = "Copiar"), 2000);
  });

  document.getElementById("door-token").addEventListener("click", async () => {
    if (event.doorToken && !confirm("El link actual va a dejar de funcionar. ¿Generar uno nuevo?")) return;
    try {
      await api(`/organizer/events/${encodeURIComponent(event.id)}/door-token`, { method: "POST" });
      await load();
    } catch (err) {
      document.getElementById("door-message").textContent = err.message;
    }
  });

  document.getElementById("new-ticket-type").addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = document.getElementById("tt-message");
    message.textContent = "";
    try {
      await api(`/organizer/events/${encodeURIComponent(event.id)}/ticket-types`, {
        method: "POST",
        body: JSON.stringify({
          name: document.getElementById("tt-name").value,
          priceCents: pesosToCents(document.getElementById("tt-price").value),
          capacity: Number(document.getElementById("tt-capacity").value),
        }),
      });
      await load();
    } catch (err) {
      message.textContent = err.message;
    }
  });
}

if (eventId) load();
else content.innerHTML = '<p class="error">No se indicó el evento.</p>';
