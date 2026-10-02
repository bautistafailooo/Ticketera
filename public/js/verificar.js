import { api } from "/js/common.js";

// El link del mail es /verificar.html#<token>.
const token = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, "", "/verificar.html");
const title = document.getElementById("title");
const detail = document.getElementById("detail");

try {
  if (!token) throw new Error("El link está incompleto. Abrilo de nuevo desde el mail.");
  const res = await api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
  title.textContent = "¡Email confirmado!";
  detail.textContent = `Listo, ${res.email} quedó confirmado. Ya podés publicar eventos y conectar Mercado Pago.`;
} catch (err) {
  title.textContent = "No pudimos confirmar tu email";
  detail.textContent = err.message;
}
document.getElementById("go").hidden = false;
