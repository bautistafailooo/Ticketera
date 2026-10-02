import { api } from "/js/common.js";

const form = document.getElementById("revocation");
const message = document.getElementById("rv-message");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  message.textContent = "";
  const name = document.getElementById("rv-name").value.trim();
  const email = document.getElementById("rv-email").value.trim();
  if (!name || !email) {
    message.textContent = "Completá tu nombre y el email con el que compraste.";
    return;
  }
  const button = document.getElementById("rv-submit");
  button.disabled = true;
  try {
    const res = await api("/legal/arrepentimiento", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        reference: document.getElementById("rv-reference").value.trim() || undefined,
        reason: document.getElementById("rv-reason").value.trim() || undefined,
      }),
    });
    form.hidden = true;
    document.getElementById("rv-code").textContent = res.code;
    document.getElementById("rv-detail").textContent =
      `Te mandamos una copia a ${email}. ` +
      (res.orderFound
        ? "Encontramos tu compra: vamos a procesar el pedido y te respondemos por email."
        : "No pudimos identificar la compra automáticamente: te vamos a escribir para confirmarla.");
    document.getElementById("revocation-done").hidden = false;
  } catch (err) {
    message.textContent = err.message;
    button.disabled = false;
  }
});
