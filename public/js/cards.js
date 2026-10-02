import { dateParts, escapeHtml, eventImage, formatPrice } from "/js/common.js";

// Tarjeta de un evento (cartelera y perfil del organizador).

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

export function eventCard(event) {
  const onSale = event.ticketTypes.filter((t) => t.status === "onsale");
  const prices = (onSale.length ? onSale : sellable(event)).map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : null;
  const { weekday, day, month, time } = dateParts(event.startsAt);
  return `
    <a class="event-card" href="/evento.html?id=${encodeURIComponent(event.id)}">
      <div class="media">
        ${eventImage(event)}
        <div class="badge-slot">${availabilityBadge(event)}</div>
      </div>
      <div class="body">
        <div class="when">${escapeHtml(weekday)} ${escapeHtml(day)} ${escapeHtml(month)} · ${escapeHtml(time)}</div>
        <h3>${escapeHtml(event.name)}</h3>
        <div class="venue">${escapeHtml(event.venue)}</div>
        <div class="meta">
          <span class="price">${from === null ? "" : from === 0 ? "Gratis" : `<span class="from">Desde</span> ${formatPrice(from)}`}</span>
          <span class="go" aria-hidden="true">→</span>
        </div>
      </div>
    </a>`;
}
