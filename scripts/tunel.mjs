// Publica ecko desde tu compu con un túnel de Cloudflare (gratis, con https).
// Uso: npm run tunel   (antes: instalar cloudflared, ver TUNEL.md)
//
// 1. Abre el túnel y averigua la dirección pública (https://algo.trycloudflare.com).
// 2. Arranca ecko con esa dirección (para los links de los mails) y protegido con contraseña.
// 3. Con Ctrl+C cierra las dos cosas.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
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

// Antes de abrir el túnel, que el puerto esté libre (si no, ecko ya está abierto en otra terminal).
await new Promise((resolve) => {
  const probe = createServer();
  probe.once("error", () => {
    console.error(
      `\nEl puerto ${PORT} ya está en uso: probablemente ecko ya está abierto en otra terminal ` +
        `(por ejemplo con "npm run dev").\nCerralo con Ctrl+C en esa terminal (o cerrá esa pestaña) y volvé a correr "npm run tunel".\n`,
    );
    process.exit(1);
  });
  probe.once("listening", () => probe.close(resolve));
  probe.listen(Number(PORT));
});

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

// cloudflared primero anuncia la dirección y unos segundos después conecta el túnel.
// Si se abre la dirección antes de que conecte, Cloudflare muestra el error 1033:
// por eso ecko se anuncia recién cuando aparece "Registered tunnel connection".
let publicUrl = null;
let started = false;

function start() {
  if (started || !publicUrl) return;
  started = true;
  clearTimeout(timeout);
  startServer(publicUrl);
}

const timeout = setTimeout(() => {
  if (started) return;
  if (publicUrl) {
    // La dirección ya está pero no confirmó la conexión: se arranca igual y se avisa.
    console.log("Cloudflare tarda en confirmar la conexión. Si el link da error 1033, esperá un minuto y recargá.");
    start();
  } else {
    stopAll(1, "Cloudflare no respondió con una dirección. Revisá tu conexión a internet y probá de nuevo.");
  }
}, 30_000);

function onTunnelOutput(chunk) {
  const text = chunk.toString();
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !publicUrl) {
    publicUrl = match[0];
    console.log("Dirección asignada, esperando a que el túnel conecte…");
  }
  // El texto exacto cambia entre versiones de cloudflared.
  if (/registered tunnel connection|connection [\w-]+ registered|connIndex=\d+.*(registered|location=)/i.test(text)) start();
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
