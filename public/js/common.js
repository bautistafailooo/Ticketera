// Funciones compartidas por las páginas de la ticketera.

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

export function formatDate(iso) {
  return dateFormatter.format(new Date(iso));
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
  document.getElementById("logout").addEventListener("click", logout);
  document.getElementById("admin-link").hidden = user.role !== "ADMIN";
  const notice = document.getElementById("account-notice");
  if (notice && user.suspended) {
    notice.textContent = "Tu cuenta está suspendida: tus eventos no aparecen en la cartelera y no podés publicar. Escribinos si creés que es un error.";
    notice.hidden = false;
  } else if (notice && !user.trusted) {
    notice.textContent = "Cada evento que publiques pasa por una revisión antes de aparecer en la cartelera. Suele ser rápido.";
    notice.hidden = false;
  }
  return user;
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
