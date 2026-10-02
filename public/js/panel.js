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

const me = await setupPanelPage();

// Perfil público: descripción y redes que se ven en /organizador.html.
const profileUrl = `${location.origin}/organizador.html?id=${encodeURIComponent(me.id)}`;
document.getElementById("pf-view").href = profileUrl;
const openProfileFromHash = () => {
  if (location.hash === "#perfil") document.getElementById("perfil").open = true;
};
openProfileFromHash();
window.addEventListener("hashchange", openProfileFromHash);
api("/organizer/profile").then((profile) => {
  document.getElementById("pf-bio").value = profile.bio ?? "";
  document.getElementById("pf-instagram").value = profile.instagram ? `@${profile.instagram}` : "";
  document.getElementById("pf-website").value = profile.website ?? "";
}).catch(() => {});
document.getElementById("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = document.getElementById("pf-message");
  try {
    const profile = await api("/organizer/profile", {
      method: "PATCH",
      body: JSON.stringify({
        bio: document.getElementById("pf-bio").value,
        instagram: document.getElementById("pf-instagram").value,
        website: document.getElementById("pf-website").value,
      }),
    });
    document.getElementById("pf-instagram").value = profile.instagram ? `@${profile.instagram}` : "";
    document.getElementById("pf-website").value = profile.website ?? "";
    message.className = "success";
    message.textContent = "Perfil guardado.";
  } catch (err) {
    message.className = "error";
    message.textContent = err.message;
  }
});
document.getElementById("pf-copy").addEventListener("click", async (e) => {
  try {
    await navigator.clipboard.writeText(profileUrl);
    e.target.textContent = "¡Copiado!";
  } catch {
    e.target.textContent = profileUrl;
  }
  setTimeout(() => (e.target.textContent = "Copiar link"), 2500);
});

// Cuenta de Mercado Pago: las ventas se cobran ahí.
const mpCard = document.getElementById("mercadopago");
const mpResult = new URLSearchParams(location.search).get("mp");
if (mpResult) history.replaceState(null, "", "/panel.html");

async function loadMercadoPago() {
  const mp = await api("/organizer/mercadopago");
  if (!mp.available) return;
  const result = mpResult === "verificar"
    ? '<p class="notice warn">Primero confirmá tu email con el link que te mandamos. Después vas a poder conectar Mercado Pago.</p>'
    : mpResult === "ok"
    ? '<p class="notice ok">¡Listo! Tu cuenta de Mercado Pago quedó conectada.</p>'
    : mpResult === "error"
      ? '<p class="notice danger">No se pudo conectar la cuenta de Mercado Pago. Probá de nuevo.</p>'
      : "";
  mpCard.hidden = false;
  mpCard.innerHTML = mp.connected
    ? `${result}
      <div class="mp-row">
        <div>
          <h2 style="margin: 0 0 4px">Mercado Pago <span class="badge ok">Conectado</span></h2>
          <p class="muted small" style="margin: 0">Lo que vendas se acredita en tu cuenta de Mercado Pago. El comprador paga aparte el cargo por servicio de ecko.</p>
        </div>
        <button type="button" class="btn btn-secondary" id="mp-disconnect">Desconectar</button>
      </div>`
    : `${result}
      <div class="mp-row">
        <div>
          <h2 style="margin: 0 0 4px">Cobrá con Mercado Pago</h2>
          <p class="muted small" style="margin: 0">Conectá tu cuenta para recibir el dinero de tus ventas directamente.${mp.required ? " <strong>Es necesario para vender entradas pagas.</strong>" : ""}</p>
        </div>
        <a class="btn btn-gradient" href="/organizer/mercadopago/connect">Conectar Mercado Pago</a>
      </div>`;
  document.getElementById("mp-disconnect")?.addEventListener("click", async () => {
    if (!confirm("Si desconectás tu cuenta, tus eventos no van a poder cobrar entradas hasta que la vuelvas a conectar. ¿Seguro?")) return;
    await api("/organizer/mercadopago/disconnect", { method: "POST" });
    await loadMercadoPago();
  });
}
loadMercadoPago().catch(() => {});

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
        address: document.getElementById("address").value || undefined,
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
