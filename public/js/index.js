import { api, escapeHtml, formatDate, formatPrice } from "/js/common.js";

const container = document.getElementById("events");

try {
  const events = await api("/events");
  if (events.length === 0) {
    container.innerHTML =
      '<p class="muted">Todavía no hay eventos publicados. Cargá los de ejemplo con <code>npm run db:seed</code>.</p>';
  } else {
    container.innerHTML = events.map((event) => {
      const prices = event.ticketTypes.map((t) => t.priceCents);
      const from = prices.length ? `Desde ${formatPrice(Math.min(...prices))}` : "";
      return `
        <a class="card" href="/evento.html?id=${encodeURIComponent(event.id)}">
          <div class="date">${escapeHtml(formatDate(event.startsAt))}</div>
          <h2>${escapeHtml(event.name)}</h2>
          <div class="muted">${escapeHtml(event.venue)}</div>
          <p class="price">${from}</p>
        </a>`;
    }).join("");
  }
} catch (err) {
  container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
}
