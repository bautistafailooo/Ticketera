import { escapeHtml, formatDate } from "/js/common.js";

const STORAGE_KEY = "ticketera-door-token";
const SAME_CODE_COOLDOWN_MS = 4000;

// La clave viaja en el #fragmento del link, así no queda en los logs del servidor.
const fromHash = location.hash.slice(1);
if (fromHash) {
  try { localStorage.setItem(STORAGE_KEY, fromHash); } catch {}
  history.replaceState(null, "", location.pathname);
}
let token = fromHash;
if (!token) {
  try { token = localStorage.getItem(STORAGE_KEY) ?? ""; } catch {}
}

async function doorApi(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", "x-door-token": token },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function showNoAccess(message) {
  if (message) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }
  document.getElementById("no-access").hidden = false;
  document.getElementById("app").hidden = true;
  document.getElementById("access-error").textContent = message ?? "";
}

function updateStats(stats) {
  if (!stats) return;
  document.getElementById("checked-in").textContent = stats.checkedIn;
  document.getElementById("paid").textContent = stats.paid;
}

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});

const resultEl = document.getElementById("result");
function showResult(kind, title, detail) {
  resultEl.className = `result ${kind}`;
  resultEl.innerHTML = `<div class="title">${escapeHtml(title)}</div>${detail ? `<div class="detail">${detail}</div>` : ""}`;
  try { navigator.vibrate?.(kind === "ok" ? 120 : [80, 60, 80, 60, 80]); } catch {}
}

let busy = false;
async function validate(code) {
  code = code.trim();
  if (!code || busy) return;
  busy = true;
  try {
    const { ok, status, body } = await doorApi("/door/check-in", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    if (ok) {
      showResult("ok", "Adelante", `${escapeHtml(body.ticketType)} · ${escapeHtml(body.buyerName)}`);
      updateStats(body.stats);
    } else if (status === 401) {
      stopCamera();
      showNoAccess(body.error);
    } else {
      const detail = body.usedAt
        ? `Ingresó a las ${escapeHtml(timeFormatter.format(new Date(body.usedAt)))} · ${escapeHtml(body.ticketType)} · ${escapeHtml(body.buyerName)}`
        : "";
      showResult("bad", body.error ?? "No se pudo validar", detail);
    }
  } catch {
    showResult("bad", "Sin conexión", "Revisá internet y probá de nuevo.");
  } finally {
    busy = false;
  }
}

document.getElementById("manual").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("code");
  await validate(input.value);
  input.value = "";
  input.focus();
});

// --- Cámara ---
const video = document.getElementById("video");
const cameraButton = document.getElementById("toggle-camera");
const cameraMessage = document.getElementById("camera-message");
let stream = null;
let detector = null;
let lastCode = "";
let lastCodeAt = 0;
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });

async function readCode() {
  if (detector) {
    const codes = await detector.detect(video);
    return codes[0]?.rawValue ?? null;
  }
  if (!window.jsQR || !video.videoWidth) return null;
  const scale = Math.min(1, 640 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return window.jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

async function scanLoop() {
  if (!stream) return;
  try {
    const code = await readCode();
    const now = Date.now();
    if (code && !(code === lastCode && now - lastCodeAt < SAME_CODE_COOLDOWN_MS)) {
      lastCode = code;
      lastCodeAt = now;
      await validate(code);
    }
  } catch {}
  setTimeout(scanLoop, 200);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cameraMessage.textContent =
      "La cámara solo funciona si la página se abre con https o en localhost. Mientras tanto, cargá el código a mano.";
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch {
    cameraMessage.textContent = "No se pudo usar la cámara. Revisá los permisos del navegador.";
    return;
  }
  if ("BarcodeDetector" in window) {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.includes("qr_code")) detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch {}
  }
  cameraMessage.textContent = "";
  video.srcObject = stream;
  video.hidden = false;
  await video.play();
  cameraButton.textContent = "Apagar cámara";
  cameraButton.classList.replace("btn-gradient", "btn-secondary");
  scanLoop();
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.hidden = true;
  video.srcObject = null;
  cameraButton.textContent = "Escanear";
  cameraButton.classList.replace("btn-secondary", "btn-gradient");
}

cameraButton.addEventListener("click", () => (stream ? stopCamera() : startCamera()));

// --- Inicio ---
if (!token) {
  showNoAccess();
} else {
  const { ok, body } = await doorApi("/door/event");
  if (!ok) {
    showNoAccess(body.error);
  } else {
    document.title = `Puerta · ${body.name}`;
    document.getElementById("event-name").textContent = body.name;
    document.getElementById("event-venue").textContent = body.venue;
    document.getElementById("event-date").textContent = formatDate(body.startsAt);
    updateStats(body.stats);
    document.getElementById("app").hidden = false;
  }
}
