import { EVENT_STATUS, api, argentinaDate, escapeHtml, formatDate, formatPrice, setupPanelPage } from "/js/common.js";

await setupPanelPage();

// No se pueden elegir fechas pasadas (hora de Argentina, UTC-3).
document.getElementById("startsAt").min = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);

const form = document.getElementById("new-event");
document.getElementById("toggle-new").addEventListener("click", () => {
  form.hidden = !form.hidden;
  if (!form.hidden) document.getElementById("name").focus();
});

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
        startsAt: argentinaDate(document.getElementById("startsAt").value),
      }),
    });
    location.href = `/panel-evento.html?id=${encodeURIComponent(event.id)}`;
  } catch (err) {
    message.textContent = err.message;
  }
});

const container = document.getElementById("events");
try {
  const events = await api("/organizer/events");
  if (events.length === 0) {
    container.innerHTML = '<p class="muted">Todavía no creaste eventos. Tocá “Nuevo evento” para empezar.</p>';
    form.hidden = false;
  } else {
    container.innerHTML = events.map((event) => {
      const { capacity, sold, revenueCents } = event.totals;
      const percent = capacity ? Math.round((sold / capacity) * 100) : 0;
      return `
        <a class="card" href="/panel-evento.html?id=${encodeURIComponent(event.id)}">
          <span class="badge ${escapeHtml(event.status)}">${EVENT_STATUS[event.status]}</span>
          <div class="date" style="margin-top: 8px">${escapeHtml(formatDate(event.startsAt))}</div>
          <h2>${escapeHtml(event.name)}</h2>
          <div class="muted">${escapeHtml(event.venue)}</div>
          <p><strong>${sold}</strong> de ${capacity} entradas · <strong>${formatPrice(revenueCents)}</strong> cobrados</p>
          <div class="progress" aria-label="${percent}% vendido"><span style="width: ${percent}%"></span></div>
          ${event.visibility.visible
            ? '<p class="visibility ok" style="margin: 12px 0 0">Visible en la cartelera</p>'
            : `<p class="visibility" style="margin: 12px 0 0">No visible: ${escapeHtml(event.visibility.reason)}</p>`}
        </a>`;
    }).join("");
  }
} catch (err) {
  container.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
}
