import { api, escapeHtml, formatDate, formatPrice } from "/js/common.js";

const MAX_TICKETS = 10;
const content = document.getElementById("content");
const eventId = new URLSearchParams(location.search).get("id");

function renderEvent(event) {
  document.title = `${event.name} · Ticketera`;
  const ticketTypes = event.ticketTypes.map((t) => {
    const available = Math.max(0, t.capacity - t.sold);
    const max = Math.min(MAX_TICKETS, available);
    const options = Array.from({ length: max + 1 }, (_, n) => `<option value="${n}">${n}</option>`).join("");
    return `
      <div class="ticket-type">
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <div class="price">${formatPrice(t.priceCents)}</div>
          <div class="muted">${available > 0 ? `${available} disponibles` : "Agotado"}</div>
        </div>
        ${available > 0 ? `
          <select data-id="${escapeHtml(t.id)}" data-price="${Number(t.priceCents)}" aria-label="Cantidad de ${escapeHtml(t.name)}">
            ${options}
          </select>` : ""}
      </div>`;
  }).join("");

  content.innerHTML = `
    <div class="date">${escapeHtml(formatDate(event.startsAt))}</div>
    <h1>${escapeHtml(event.name)}</h1>
    <div class="muted">${escapeHtml(event.venue)}</div>
    ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}

    <div class="layout">
      <section class="card">
        <h2>Entradas</h2>
        ${ticketTypes}
      </section>

      <form class="card" id="checkout">
        <h2>Tus datos</h2>
        <label for="name">Nombre y apellido</label>
        <input id="name" required autocomplete="name">
        <label for="email">Email</label>
        <input id="email" type="email" required autocomplete="email">
        <div class="total"><span>Total</span><span id="total">${formatPrice(0)}</span></div>
        <p class="muted">Hasta ${MAX_TICKETS} entradas por compra. Después de confirmar tenés un rato para pagar; si no, las entradas se liberan.</p>
        <button type="submit">Comprar</button>
        <p id="message" role="alert"></p>
      </form>
    </div>`;

  const selects = [...content.querySelectorAll("select")];
  const totalEl = document.getElementById("total");
  const message = document.getElementById("message");

  const selectedItems = () => selects
    .map((s) => ({ ticketTypeId: s.dataset.id, quantity: Number(s.value), priceCents: Number(s.dataset.price) }))
    .filter((item) => item.quantity > 0);

  selects.forEach((s) => s.addEventListener("change", () => {
    const total = selectedItems().reduce((sum, i) => sum + i.quantity * i.priceCents, 0);
    totalEl.textContent = formatPrice(total);
  }));

  document.getElementById("checkout").addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = selectedItems().map(({ ticketTypeId, quantity }) => ({ ticketTypeId, quantity }));
    if (items.length === 0) {
      message.className = "error";
      message.textContent = "Elegí al menos una entrada.";
      return;
    }
    if (items.reduce((sum, i) => sum + i.quantity, 0) > MAX_TICKETS) {
      message.className = "error";
      message.textContent = `Podés comprar hasta ${MAX_TICKETS} entradas por compra.`;
      return;
    }

    const button = e.submitter;
    button.disabled = true;
    button.textContent = "Procesando…";
    message.textContent = "";
    try {
      const order = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          buyerName: document.getElementById("name").value,
          buyerEmail: document.getElementById("email").value,
          items,
        }),
      });
      // La orden se ve con su clave secreta, que viaja en el #fragmento del link.
      location.href = `/orden.html#${encodeURIComponent(order.id)}.${encodeURIComponent(order.accessToken)}`;
    } catch (err) {
      message.className = "error";
      message.textContent = err.message;
      button.disabled = false;
      button.textContent = "Comprar";
    }
  });
}

try {
  if (!eventId) throw new Error("No se indicó el evento.");
  renderEvent(await api(`/events/${encodeURIComponent(eventId)}`));
} catch (err) {
  content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
}
