// Publica ecko desde tu compu con un túnel de Cloudflare (gratis, con https).
// Uso: npm run tunel   (antes: instalar cloudflared, ver TUNEL.md)
//
// 1. Abre el túnel y averigua la dirección pública (https://algo.trycloudflare.com).
// 2. Arranca ecko con esa dirección (para los links de los mails) y protegido con contraseña.
// 3. Con Ctrl+C cierra las dos cosas.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import "dotenv/config";

const PORT = process.env.PORT ?? "3000";

// Busca cloudflared: primero la variable CLOUDFLARED_BIN, después las carpetas donde lo
// instala Windows (así anda aunque la terminal se haya abierto antes de instalarlo).
function findCloudflared() {
  if (process.env.CLOUDFLARED_BIN) return process.env.CLOUDFLARED_BIN;
  if (process.platform === "win32") {
    const candidates = [
      `${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\cloudflared\\cloudflared.exe`,
      `${process.env.ProgramFiles ?? "C:\\Program Files"}\\cloudflared\\cloudflared.exe`,
      `${process.env.LOCALAPPDATA ?? ""}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
    ];
    const found = candidates.find((path) => existsSync(path));
    if (found) return found;
  }
  return "cloudflared";
}
const CLOUDFLARED = findCloudflared();
// El sitio queda público en internet: siempre con contraseña.
const SITE_PASSWORD = process.env.SITE_PASSWORD || randomBytes(6).toString("hex");

const children = [];
let stopping = false;
function stopAll(code = 0, reason = "") {
  if (stopping) return;
  stopping = true;
  if (reason) console.log(`\n${reason}`);
  console.log("ecko y el túnel quedaron cerrados. Para volver a abrirlos: npm run tunel");
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0, "Cerrado con Ctrl+C."));
process.on("SIGTERM", () => stopAll(0, "Cerrado."));

console.log("Abriendo el túnel de Cloudflare…");
const tunnel = spawn(CLOUDFLARED, ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(tunnel);

tunnel.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("\nNo encontré cloudflared. Instalalo con:\n  winget install --id Cloudflare.cloudflared\ny después cerrá y volvé a abrir la terminal.\n");
  } else {
    console.error("No se pudo abrir el túnel:", err.message);
  }
  stopAll(1);
});
tunnel.on("exit", (code, signal) => {
  stopAll(1, `El túnel de Cloudflare se cerró solo (código ${code ?? signal}). Revisá tu conexión a internet.`);
});

let started = false;
const timeout = setTimeout(() => {
  if (!started) {
    console.error("Cloudflare no respondió con una dirección. Revisá tu conexión y probá de nuevo.");
    stopAll(1);
  }
}, 60_000);

function onTunnelOutput(chunk) {
  const match = chunk.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (!match || started) return;
  started = true;
  clearTimeout(timeout);
  startServer(match[0]);
}
tunnel.stdout.on("data", onTunnelOutput);
tunnel.stderr.on("data", onTunnelOutput);

function startServer(publicUrl) {
  const server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT,
      PUBLIC_URL: publicUrl,
      SITE_PASSWORD,
      // Cloudflare está delante: la IP real del visitante viene en los encabezados.
      TRUST_PROXY: "1",
    },
  });
  children.push(server);
  server.on("exit", (code, signal) => {
    stopAll(code || 1, `ecko se cerró (código ${code ?? signal}). Si arriba aparece un error, copialo con clic derecho.`);
  });

  const line = "─".repeat(60);
  console.log(`
${line}
  ecko está online (mientras esta ventana siga abierta)

  Dirección:  ${publicUrl}
  Contraseña: ${SITE_PASSWORD}   (el usuario puede ser cualquiera)

  Pasale los dos datos a quien quieras que pruebe.
  La dirección cambia cada vez que corrés "npm run tunel".
  Dejá esta ventana abierta. Para copiar texto usá clic derecho:
  Ctrl+C acá cierra ecko.
${line}
`);
}
