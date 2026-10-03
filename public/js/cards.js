import { dateParts, escapeHtml, eventImage, formatPrice } from "/js/common.js";

// Tarjeta de un evento (cartelera y perfil del organizador).

// Los lotes que ya terminaron no cuentan: lo que queda es lo que está o va a estar a la venta.
const sellable = (event) => event.ticketTypes.filter((t) => t.status === "onsale" || t.status === "upcoming");

function availabilityBadge(event) {
  const types = sellable(event);
  const capacity = types.reduce((sum, t) => sum + t.capacity, 0);
  const left = types.reduce((sum, t) => sum + Math.max(0, t.capacity - t.sold), 0);
  if (left === 0) return '<span class="card-pill">Agotado</span>';
  if (left <= Math.max(10, capacity * 0.1)) return '<span class="card-pill hot">Últimas entradas</span>';
  return "";
}

const pinIcon =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';

// La foto ocupa toda la tarjeta; los datos van abajo, sobre un degradé oscuro.
export function eventCard(event) {
  const onSale = event.ticketTypes.filter((t) => t.status === "onsale");
  const prices = (onSale.length ? onSale : sellable(event)).map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : null;
  const { day, month } = dateParts(event.startsAt);
  const price = from === null ? "" : from === 0 ? "Gratis" : `<span class="from">desde</span> ${formatPrice(from)}`;
  return `
    <a class="event-card" href="/evento.html?id=${encodeURIComponent(event.id)}">
      <div class="media">${eventImage(event)}</div>
      <div class="top">
        <div class="badge-slot">${availabilityBadge(event)}</div>
        <div class="date-pill"><span class="day">${escapeHtml(day)}</span><span class="month">${escapeHtml(month)}</span></div>
      </div>
      <div class="body">
        <h3>${escapeHtml(event.name)}</h3>
        <div class="place">${pinIcon}<span>${escapeHtml(event.venue)}</span></div>
        <div class="foot">
          <span class="by">${event.organizer ? `por <b>${escapeHtml(event.organizer.name)}</b>` : ""}</span>
          <span class="price">${price}</span>
        </div>
      </div>
    </a>`;
}
