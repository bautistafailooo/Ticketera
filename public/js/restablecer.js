import { api } from "/js/common.js";

// El token viaja en el #fragmento del link del mail; se saca de la barra de direcciones.
const token = decodeURIComponent(location.hash.slice(1));
history.replaceState(null, "", location.pathname);

const form = document.getElementById("form");
const message = document.getElementById("message");
const submit = document.getElementById("submit");

if (!token) {
  message.innerHTML = 'El link está incompleto. <a href="/login.html">Pedí uno nuevo</a>.';
  submit.disabled = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;
  if (password !== document.getElementById("confirm").value) {
    message.textContent = "Las contraseñas no coinciden.";
    return;
  }
  submit.disabled = true;
  message.textContent = "";
  try {
    await api("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
    location.href = "/panel.html";
  } catch (err) {
    message.textContent = err.message;
    submit.disabled = false;
  }
});
