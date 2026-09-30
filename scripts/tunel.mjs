// Publica ecko desde tu compu con un túnel de Cloudflare (gratis, con https).
// Uso: npm run tunel   (antes: instalar cloudflared, ver TUNEL.md)
//
// 1. Abre el túnel y averigua la dirección pública (https://algo.trycloudflare.com).
// 2. Arranca ecko con esa dirección (para los links de los mails) y protegido con contraseña.
// 3. Con Ctrl+C cierra las dos cosas.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import "dotenv/config";

const PORT = process.env.PORT ?? "3000";
const CLOUDFLARED = process.env.CLOUDFLARED_BIN ?? "cloudflared";
// El sitio queda público en internet: siempre con contraseña.
const SITE_PASSWORD = process.env.SITE_PASSWORD || randomBytes(6).toString("hex");

const children = [];
function stopAll(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

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
tunnel.on("exit", (code) => {
  console.error(`El túnel se cerró (código ${code}).`);
  stopAll(1);
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
  server.on("exit", (code) => stopAll(code ?? 0));

  const line = "─".repeat(60);
  console.log(`
${line}
  ecko está online (mientras esta ventana siga abierta)

  Dirección:  ${publicUrl}
  Contraseña: ${SITE_PASSWORD}   (el usuario puede ser cualquiera)

  Pasale los dos datos a quien quieras que pruebe.
  La dirección cambia cada vez que corrés "npm run tunel".
  Para cerrar: Ctrl+C
${line}
`);
}
