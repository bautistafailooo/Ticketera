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

export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
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

export async function logout() {
  await api("/auth/logout", { method: "POST" });
  location.href = "/login.html";
}

// Convierte el valor de un <input type="datetime-local"> a hora de Argentina.
export function argentinaDate(localValue) {
  return new Date(`${localValue}:00-03:00`).toISOString();
}

// Convierte un monto en pesos escrito por el usuario (ej. "35000" o "35.000,50") a centavos.
export function pesosToCents(text) {
  const normalized = String(text).trim().replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) throw new Error("Precio inválido");
  return Math.round(value * 100);
}
