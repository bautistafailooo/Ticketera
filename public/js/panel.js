import {
  EVENT_STATUS,
  api,
  argentinaDate,
  escapeHtml,
  eventImage,
  formatDate,
  formatPrice,
  setupPanelPage,
} from "/js/common.js";

await setupPanelPage();

const form = document.getElementById("new-event");
const startsAt = document.getElementById("startsAt");
// No se pueden elegir fechas pasadas (hora de Argentina, UTC-3).
startsAt.min = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);

function toggleForm(show) {
  form.hidden = !show;
  if (show) document.getElementById("name").focus();
}
document.getElementById("toggle-new").addEventListener("click", () => toggleForm(form.hidden));
document.getElementById("cancel-new").addEventListener("click", () => toggleForm(false));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = document.getElementById("new-message");
  message.textContent = "";
  try {
    const event = await api("/organizer/events", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("name").value,
        description: document.getElementById("description").value || undefined,
        venue: document.getElementById("venue").value,
        startsAt: argentinaDate(startsAt.value),
      }),
    });
    location.href = `/panel-evento.html?id=${encodeURIComponent(event.id)}`;
  } catch (err) {
    message.textContent = err.message;
  }
});

function card(event) {
  const { capacity, sold, revenueCents } = event.totals;
  const percent = capacity ? Math.round((sold / capacity) * 100) : 0;
  return `
    <a class="card panel-card" href="/panel-evento.html?id=${encodeURIComponent(event.id)}">
      <div class="thumb">${eventImage(event)}</div>
      <div>
        <span class="badge ${escapeHtml(event.status)}">${EVENT_STATUS[event.status]}</span>
        <h3>${escapeHtml(event.name)}</h3>
        <div class="muted small">${escapeHtml(formatDate(event.startsAt))} h · ${escapeHtml(event.venue)}</div>
        <div class="small" style="margin-top: 8px"><strong>${sold}</strong> de ${capacity} entradas · <strong>${formatPrice(revenueCents)}</strong> cobrados</div>
        <div class="progress" aria-label="${percent}% vendido"><span style="width: ${percent}%"></span></div>
        <p class="visibility ${event.visibility.visible ? "ok" : ""}">
          ${event.visibility.visible ? "Visible en la cartelera" : `No visible: ${escapeHtml(event.visibility.reason)}`}
        </p>
      </div>
    </a>`;
}

const container = document.getElementById("events");
try {
  const events = await api("/organizer/events");
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty" style="grid-column: 1 / -1">
        <h2>Creá tu primer evento</h2>
        <p>Cargá los datos, subí el flyer, definí las entradas y publicalo.</p>
      </div>`;
    toggleForm(true);
  } else {
    container.innerHTML = events.map(card).join("");
  }
} catch (err) {
  container.innerHTML = `<div class="empty error" style="grid-column: 1 / -1">${escapeHtml(err.message)}</div>`;
}
