import { eventCard } from "/js/cards.js";
import { SITE, api, dateParts, escapeHtml } from "/js/common.js";
import { startEcho } from "/js/fx.js";

startEcho(document.getElementById("echo"));

const container = document.getElementById("events");
const count = document.getElementById("count");
const search = document.getElementById("search");
document.getElementById("tagline").textContent = SITE.tagline;

let events = [];

// Quita acentos y mayúsculas para buscar "cordoba" y encontrar "Córdoba".
const normalize = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
    container.innerHTML = shown.map(eventCard).join("");
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
