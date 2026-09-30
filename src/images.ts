import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Reconoce el tipo real del archivo por sus primeros bytes, sin confiar en lo que declara el navegador.
export function detectImageType(data: Buffer) {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export async function saveImage(data: Buffer, extension: string) {
  await mkdir(config.uploadDir, { recursive: true });
  const file = `${randomBytes(16).toString("hex")}.${extension}`;
  await writeFile(path.join(config.uploadDir, file), data);
  return file;
}

export async function deleteImage(file: string | null) {
  // Solo nombres generados por saveImage: nunca rutas con carpetas.
  if (!file || !/^[0-9a-f]{32}\.(jpg|png|webp)$/.test(file)) return;
  await unlink(path.join(config.uploadDir, file)).catch(() => {});
}
