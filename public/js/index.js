import { SITE, api, dateChip, dateParts, escapeHtml, eventImage, formatPrice } from "/js/common.js";
import { startEcho } from "/js/fx.js";

startEcho(document.getElementById("echo"));

const container = document.getElementById("events");
const count = document.getElementById("count");
const search = document.getElementById("search");
document.getElementById("tagline").textContent = SITE.tagline;

let events = [];

// Quita acentos y mayúsculas para buscar "cordoba" y encontrar "Córdoba".
const normalize = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Los lotes que ya terminaron no cuentan: lo que queda es lo que está o va a estar a la venta.
const sellable = (event) => event.ticketTypes.filter((t) => t.status === "onsale" || t.status === "upcoming");

function availabilityBadge(event) {
  const types = sellable(event);
  const capacity = types.reduce((sum, t) => sum + t.capacity, 0);
  const left = types.reduce((sum, t) => sum + Math.max(0, t.capacity - t.sold), 0);
  if (left === 0) return '<span class="badge danger">Agotado</span>';
  if (left <= Math.max(10, capacity * 0.1)) return '<span class="badge hot">Últimas entradas</span>';
  return "";
}

function card(event) {
  const onSale = event.ticketTypes.filter((t) => t.status === "onsale");
  const prices = (onSale.length ? onSale : sellable(event)).map((t) => t.priceCents);
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

// Cinta con los próximos eventos que pasa de costado. Se repite para llenar el ancho
// y se duplica para que el movimiento sea continuo.
function renderMarquee() {
  if (events.length === 0) return;
  let items = events.slice(0, 12).map((e) => {
    const { day, month } = dateParts(e.startsAt);
    return `<span class="marquee-item">${escapeHtml(e.name)} <span class="d">${escapeHtml(day)} ${escapeHtml(month)}</span><span class="star">✦</span></span>`;
  });
  while (items.length < 8) items = items.concat(items);
  const track = document.getElementById("marquee");
  track.innerHTML = items.join("") + items.join("");
  track.style.animationDuration = `${items.length * 4}s`;
  track.parentElement.hidden = false;
}

search.addEventListener("input", render);

try {
  events = await api("/events");
  render();
  renderMarquee();
} catch (err) {
  container.innerHTML = `<div class="empty error" style="grid-column: 1 / -1">${escapeHtml(err.message)}</div>`;
}
