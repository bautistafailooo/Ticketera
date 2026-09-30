import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { backupDatabase } from "../src/backup.js";
import { config } from "../src/config.js";
import { app } from "./helpers.js";

const auth = (password: string) => `Basic ${Buffer.from(`cualquiera:${password}`).toString("base64")}`;

describe("sitio privado", () => {
  afterEach(() => {
    config.sitePassword = undefined;
  });

  it("sin SITE_PASSWORD el sitio es público", async () => {
    expect((await request(app).get("/")).status).toBe(200);
  });

  it("con SITE_PASSWORD pide la contraseña en todas las páginas y la API", async () => {
    config.sitePassword = "clave-del-sitio";
    for (const path of ["/", "/evento.html", "/events", "/styles.css"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.headers["www-authenticate"]).toContain("Basic");
    }
    expect((await request(app).get("/").set("Authorization", auth("otra"))).status).toBe(401);
    const ok = await request(app).get("/").set("Authorization", auth("clave-del-sitio"));
    expect(ok.status).toBe(200);
    expect(ok.headers["x-robots-tag"]).toContain("noindex");
  });

  it("el chequeo de salud responde sin contraseña", async () => {
    config.sitePassword = "clave-del-sitio";
    expect((await request(app).get("/health")).status).toBe(200);
  });
});

describe("copias de seguridad", () => {
  const dir = path.resolve("test-backups");
  afterEach(() => {
    config.backupDir = undefined;
    rmSync(dir, { recursive: true, force: true });
  });

  it("hace una copia por día y guarda solo las últimas 7", async () => {
    config.backupDir = dir;
    const file = await backupDatabase(new Date("2026-10-01T12:00:00Z"));
    expect(file && existsSync(file)).toBe(true);
    expect(await backupDatabase(new Date("2026-10-01T18:00:00Z"))).toBeNull(); // ya hay una de ese día

    for (let day = 2; day <= 10; day++) {
      await backupDatabase(new Date(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`));
    }
    const files = readdirSync(dir).sort();
    expect(files).toHaveLength(7);
    expect(files[0]).toBe("ecko-2026-10-04.db");
  });

  it("sin BACKUP_DIR no hace nada", async () => {
    expect(await backupDatabase()).toBeNull();
  });
});
