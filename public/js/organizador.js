import { eventCard } from "/js/cards.js";
import { api, escapeHtml } from "/js/common.js";

// Perfil público de un organizador: /organizador.html?id=<id>
const content = document.getElementById("content");
const id = new URLSearchParams(location.search).get("id");
const lights = '<div class="bg-lights" aria-hidden="true"><span></span><span></span></div>';

function render(profile) {
  document.title = `${profile.name} · ecko`;
  const links = [
    profile.instagram
      ? `<a class="btn btn-secondary btn-small" href="https://instagram.com/${encodeURIComponent(profile.instagram)}" target="_blank" rel="noopener">Instagram · @${escapeHtml(profile.instagram)}</a>`
      : "",
    profile.website
      ? `<a class="btn btn-secondary btn-small" href="${escapeHtml(profile.website)}" target="_blank" rel="noopener nofollow">${escapeHtml(new URL(profile.website).hostname.replace(/^www\./, ""))}</a>`
      : "",
  ].join("");
  content.innerHTML = `
    ${lights}
    <section class="profile-head">
      <div class="profile-avatar" aria-hidden="true">${escapeHtml(profile.name.trim().charAt(0).toUpperCase())}</div>
      <div>
        <p class="eyebrow">Organizador</p>
        <h1>${escapeHtml(profile.name)}</h1>
        ${profile.bio ? `<p class="profile-bio">${escapeHtml(profile.bio)}</p>` : ""}
        ${links ? `<div class="form-actions" style="margin-top: 12px">${links}</div>` : ""}
      </div>
    </section>

    <div class="section-head">
      <h2>Próximos eventos</h2>
      <span class="muted small">${profile.events.length ? `${profile.events.length} ${profile.events.length === 1 ? "evento" : "eventos"}` : ""}</span>
    </div>
    ${profile.events.length
      ? `<div class="event-grid">${profile.events.map(eventCard).join("")}</div>`
      : '<div class="empty">Por ahora no tiene eventos a la venta.</div>'}`;
}

try {
  if (!id) throw new Error("No se indicó el organizador.");
  render(await api(`/organizers/${encodeURIComponent(id)}`));
} catch (err) {
  content.innerHTML = `${lights}<div class="empty"><p class="error">${escapeHtml(err.message)}</p><a class="btn btn-secondary" href="/">Ir a la cartelera</a></div>`;
}
