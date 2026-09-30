import { api, escapeHtml, setupPanelPage } from "/js/common.js";

const user = await setupPanelPage();
const content = document.getElementById("content");
const message = document.getElementById("message");

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

function statusOf(u) {
  if (u.role === "ADMIN") return '<span class="badge PUBLISHED">Admin</span>';
  return u.approvedAt
    ? '<span class="badge PUBLISHED">Aprobado</span>'
    : '<span class="badge">Pendiente</span>';
}

function actionOf(u) {
  if (u.role === "ADMIN") return "";
  return u.approvedAt
    ? `<button type="button" class="link-button" data-action="revoke" data-id="${escapeHtml(u.id)}">Quitar aprobación</button>`
    : `<button type="button" class="button-inline" data-action="approve" data-id="${escapeHtml(u.id)}">Aprobar</button>`;
}

async function load() {
  try {
    const users = await api("/admin/organizers");
    content.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Organizador</th><th>Alta</th><th class="num">Eventos</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${escapeHtml(u.name)}<div class="muted">${escapeHtml(u.email)}</div></td>
              <td>${escapeHtml(dateFormatter.format(new Date(u.createdAt)))}</td>
              <td class="num">${u._count.events}</td>
              <td>${statusOf(u)}</td>
              <td class="num">${actionOf(u)}</td>
            </tr>`).join("")}
        </tbody>
      </table></div>`;
  } catch (err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
  }
}

content.addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "revoke" && !confirm("Sus eventos van a salir de la cartelera y no va a poder vender. ¿Continuar?")) return;
  button.disabled = true;
  message.textContent = "";
  try {
    await api(`/admin/organizers/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    await load();
  } catch (err) {
    message.textContent = err.message;
    button.disabled = false;
  }
});

if (user.role !== "ADMIN") {
  content.innerHTML = '<p class="error">Esta página es solo para administradores.</p>';
} else {
  load();
}
