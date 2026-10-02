// Funciones compartidas por las páginas de la ticketera.

// Nombre y lema del sitio: cambiarlos acá los cambia en todas las páginas.
export const SITE = {
  name: "ecko",
  tagline: "Las mejores fechas, en un solo lugar.",
  // Email de contacto que se muestra en el pie y en las páginas legales.
  contactEmail: "eckotickets@gmail.com",
};

// Links de contacto: <a data-contact-email></a> (si el link no tiene texto, muestra el email).
for (const el of document.querySelectorAll("[data-contact-email]")) {
  el.href = `mailto:${SITE.contactEmail}`;
  if (!el.textContent.trim()) el.textContent = SITE.contactEmail;
}

// Aplica el nombre del sitio al logo, al pie y al título de la pestaña.
for (const el of document.querySelectorAll("[data-site-name]")) el.textContent = SITE.name;
document.title = document.title.replace("ecko", SITE.name);

const priceFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

const priceWithCentsFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

export function formatPrice(cents) {
  const formatter = cents % 100 === 0 ? priceFormatter : priceWithCentsFormatter;
  return formatter.format(cents / 100);
}

// Cargo por servicio: la misma cuenta que src/payments/fee.ts (redondeado a pesos enteros).
export function serviceFee(subtotalCents, percent) {
  return Math.round((subtotalCents * percent) / 100 / 100) * 100;
}

export function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
}

const partsFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

// Día, mes abreviado, día de la semana y hora por separado (hora de Argentina).
export function dateParts(iso) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return {
    day: parts.day,
    month: parts.month.replace(".", ""),
    weekday: parts.weekday.replace(".", ""),
    time: `${parts.hour}:${parts.minute}`,
  };
}

// Chip con el día y el mes, para poner sobre el flyer.
export function dateChip(iso) {
  const { day, month } = dateParts(iso);
  return `<div class="date-chip"><span class="day">${escapeHtml(day)}</span><span class="month">${escapeHtml(month)}</span></div>`;
}

// Flyer del evento o, si no tiene, un degradé con su inicial.
export function eventImage(event, alt = "") {
  if (event.imageFile) {
    return `<img class="flyer" src="/media/${encodeURIComponent(event.imageFile)}" alt="${escapeHtml(alt)}" loading="lazy">`;
  }
  const variant = [...String(event.id ?? event.name)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 4;
  const initial = (event.name ?? "?").trim().charAt(0).toUpperCase();
  return `<div class="flyer-placeholder v${variant}" aria-hidden="true">${escapeHtml(initial)}</div>`;
}

// Achica la imagen en el navegador antes de subirla: sube rápido desde el celular
// y se descartan los metadatos de la foto (ubicación, modelo del teléfono).
export async function resizeImage(file, maxSize = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
  // Algunos navegadores no generan WebP: en ese caso devuelven PNG y usamos JPG.
  const webp = await toBlob("image/webp");
  return webp?.type === "image/webp" ? webp : toBlob("image/jpeg");
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

// Escapa texto para insertarlo en HTML, también dentro de atributos.
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Algo salió mal, probá de nuevo");
  return body;
}

// Devuelve el organizador logueado o redirige al login.
export async function requireLogin() {
  try {
    return await api("/auth/me");
  } catch {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
    return new Promise(() => {});
  }
}

// Completa el encabezado de las páginas del panel y devuelve el usuario logueado.
export async function setupPanelPage() {
  const user = await requireLogin();
  document.getElementById("user-name").textContent = user.name;
  document.getElementById("user-initial").textContent = (user.name.trim()[0] ?? "?").toUpperCase();
  document.getElementById("menu-name").textContent = user.name;
  document.getElementById("menu-email").textContent = user.email;
  document.getElementById("logout").addEventListener("click", logout);
  document.getElementById("admin-link").hidden = user.role !== "ADMIN";
  setupAccountMenu();
  // Marca la sección actual en el menú.
  const section = location.pathname.startsWith("/admin") ? "admin" : "panel";
  document.querySelector(`[data-section="${section}"]`)?.setAttribute("aria-current", "page");
  const notice = document.getElementById("account-notice");
  if (notice && !user.verified && !user.suspended) {
    notice.innerHTML = `<span><strong>Confirmá tu email.</strong> Te mandamos un link a ${escapeHtml(user.email)}. Hasta confirmarlo podés preparar eventos, pero no publicarlos ni conectar Mercado Pago.</span>
      <button type="button" class="link-button" id="resend-verification">Reenviar mail</button>`;
    notice.classList.add("warn");
    notice.hidden = false;
    document.getElementById("resend-verification").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try {
        const res = await api("/auth/resend-verification", { method: "POST" });
        e.target.textContent = `Enviado a ${res.email}`;
      } catch (err) {
        e.target.textContent = err.message;
      }
    });
  } else if (notice && user.suspended) {
    notice.textContent = "Tu cuenta está suspendida: tus eventos no aparecen en la cartelera y no podés publicar. Escribinos si creés que es un error.";
    notice.classList.add("danger");
    notice.hidden = false;
  } else if (notice && !user.trusted) {
    notice.textContent = "Cada evento que publiques pasa por una revisión antes de aparecer en la cartelera. Suele ser rápido.";
    notice.hidden = false;
  }
  return user;
}

// Menú de la cuenta (nombre, email y cerrar sesión): se abre con el botón y se cierra
// tocando afuera o con Escape.
function setupAccountMenu() {
  const button = document.getElementById("account-button");
  const menu = document.getElementById("account-menu");
  const toggle = (open) => {
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) toggle(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      toggle(false);
      button.focus();
    }
  });
}

export async function logout() {
  await api("/auth/logout", { method: "POST" });
  location.href = "/login.html";
}

export const EVENT_STATUS = {
  DRAFT: "Borrador",
  PENDING_REVIEW: "En revisión",
  PUBLISHED: "Publicado",
  REJECTED: "Rechazado",
  PAUSED: "Pausado",
  CANCELLED: "Cancelado",
};

// Valor para un <input type="datetime-local"> con la hora de Argentina (UTC-3).
export function argentinaLocalValue(iso) {
  return new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// Convierte el valor de un <input type="datetime-local"> a hora de Argentina.
export function argentinaDate(localValue) {
  return new Date(`${localValue}:00-03:00`).toISOString();
}

// Convierte un monto en pesos escrito por el usuario a centavos. Acepta "35000",
// "35.000", "35.000,50", "35000,5" y también "1500.50" (punto como decimal).
export function pesosToCents(text) {
  let normalized = String(text).trim().replace(/\s|\$/g, "");
  if (normalized.includes(",")) {
    // Formato argentino: puntos de miles y coma decimal.
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normalized)) {
    // Solo puntos de miles: "35.000" o "1.500.000".
    normalized = normalized.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Precio inválido. Escribilo como 35000 o 35.000,50");
  }
  return Math.round(Number(normalized) * 100);
}

// Destino seguro después del login: solo páginas de este mismo sitio.
export function safeNext(next, fallback) {
  if (!next) return fallback;
  try {
    const url = new URL(next, location.origin);
    return url.origin === location.origin ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

// En las páginas públicas, el botón "Vendé entradas" pasa a ser "Mi panel" si ya hay sesión.
const accountLink = document.querySelector("[data-account-link]");
if (accountLink) {
  fetch("/auth/me")
    .then((res) => {
      if (!res.ok) return;
      accountLink.textContent = "Mi panel";
      accountLink.href = "/panel.html";
    })
    .catch(() => {});
}

// En el celular las tablas se muestran como tarjetas: cada celda lleva el nombre de su
// columna (data-label) para mostrarlo al lado del valor. Se completa solo en cada tabla nueva.
function labelTables(root) {
  for (const table of root.querySelectorAll?.("table") ?? []) {
    const headers = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    for (const row of table.querySelectorAll("tbody tr, tfoot tr")) {
      [...row.children].forEach((cell, i) => {
        if (headers[i] && !cell.dataset.label) cell.dataset.label = headers[i];
      });
    }
  }
}
labelTables(document);
new MutationObserver((mutations) => {
  for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) labelTables(node.parentElement ?? node);
}).observe(document.documentElement, { childList: true, subtree: true });
