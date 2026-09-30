import { api, safeNext } from "/js/common.js";

const target = safeNext(new URLSearchParams(location.search).get("next"), "/panel.html");
let mode = "login";

// Si ya hay sesión, directo al panel.
api("/auth/me").then(() => location.replace(target), () => {});

const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name");
const password = document.getElementById("password");
const submit = document.getElementById("submit");
const message = document.getElementById("message");

function setMode(newMode) {
  mode = newMode;
  document.getElementById("tab-login").setAttribute("aria-selected", mode === "login");
  document.getElementById("tab-register").setAttribute("aria-selected", mode === "register");
  nameField.hidden = mode === "login";
  nameInput.required = mode === "register";
  password.autocomplete = mode === "login" ? "current-password" : "new-password";
  submit.textContent = mode === "login" ? "Ingresar" : "Crear cuenta";
  message.textContent = "";
}

document.getElementById("tab-login").addEventListener("click", () => setMode("login"));
document.getElementById("tab-register").addEventListener("click", () => setMode("register"));

document.getElementById("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  submit.disabled = true;
  message.textContent = "";
  const body = { email: document.getElementById("email").value, password: password.value };
  if (mode === "register") body.name = nameInput.value;
  try {
    await api(`/auth/${mode}`, { method: "POST", body: JSON.stringify(body) });
    location.href = target;
  } catch (err) {
    message.textContent = err.message;
    submit.disabled = false;
  }
});
