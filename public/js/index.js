import { SITE, api, dateChip, dateParts, escapeHtml, eventImage, formatPrice } from "/js/common.js";

const container = document.getElementById("events");
const count = document.getElementById("count");
const search = document.getElementById("search");
document.getElementById("tagline").textContent = SITE.tagline;

let events = [];

// Quita acentos y mayúsculas para buscar "cordoba" y encontrar "Córdoba".
const normalize = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function availabilityBadge(event) {
  const capacity = event.ticketTypes.reduce((sum, t) => sum + t.capacity, 0);
  const left = event.ticketTypes.reduce((sum, t) => sum + Math.max(0, t.capacity - t.sold), 0);
  if (left === 0) return '<span class="badge danger">Agotado</span>';
  if (left <= Math.max(10, capacity * 0.1)) return '<span class="badge hot">Últimas entradas</span>';
  return "";
}

function card(event) {
  const prices = event.ticketTypes.map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : null;
  const { weekday, time } = dateParts(event.startsAt);
  return `
    <a class="event-card" href="/evento.html?id=${encodeURIComponent(event.id)}">
      <div class="media">
        ${eventImage(event)}
        ${dateChip(event.startsAt)}
        <div class="badge-slot">${availabilityBadge(event)}</div>
      </div>
      <div class="body">
        <h3>${escapeHtml(event.name)}</h3>
        <div class="venue">${escapeHtml(event.venue)}</div>
        <div class="faint small cap">${escapeHtml(weekday)} · ${escapeHtml(time)} h</div>
        <div class="meta">
          <span class="price">${from === null ? "" : from === 0 ? "Gratis" : `<span class="faint small" style="font-weight: 500">Desde</span> ${formatPrice(from)}`}</span>
        </div>
      </div>
    </a>`;
}

function render() {
  const query = normalize(search.value.trim());
  const shown = query
    ? events.filter((e) => normalize(`${e.name} ${e.venue} ${e.description ?? ""}`).includes(query))
    : events;

  count.textContent = events.length ? `${shown.length} ${shown.length === 1 ? "evento" : "eventos"}` : "";
  if (events.length === 0) {
    container.innerHTML = '<div class="empty" style="grid-column: 1 / -1">Todavía no hay eventos a la venta. Volvé pronto.</div>';
  } else if (shown.length === 0) {
    container.innerHTML = `<div class="empty" style="grid-column: 1 / -1">No encontramos eventos para “${escapeHtml(search.value)}”.</div>`;
  } else {
    container.innerHTML = shown.map(card).join("");
  }
}

search.addEventListener("input", render);

try {
  events = await api("/events");
  render();
} catch (err) {
  container.innerHTML = `<div class="empty error" style="grid-column: 1 / -1">${escapeHtml(err.message)}</div>`;
}
