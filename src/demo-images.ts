import { randomBytes } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { deleteImage } from "./images.js";

// Imágenes de ejemplo para los eventos de prueba (están en demo/imagenes).
// `npm run demo:imagenes` le pone a cada evento de la base la que mejor le va según su nombre.

const DIR = path.join(import.meta.dirname, "../demo/imagenes");

const THEMES: [string, RegExp][] = [
  ["standup", /stand ?up|humor|comedia|comediant/],
  ["teatro", /teatro|obra|musical|opera|ballet/],
  ["jazz", /jazz|blues|parque|atardecer|acustic/],
  ["electro", /electr|techno|house|rave|dj set/],
  ["club", /club|dj|boliche|after/],
  ["fiesta", /fiesta|cumbia|reggaeton|cuarteto|baile|party/],
  ["festival", /festival|fest\b|open air|aire libre/],
  ["rock", /rock|banda|recital|concierto|metal|punk|indie/],
];
const ALL = ["rock", "electro", "fiesta", "festival", "club", "jazz", "teatro", "standup"];

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function themeFor(name: string, index = 0) {
  const text = normalize(name);
  return THEMES.find(([, re]) => re.test(text))?.[0] ?? ALL[index % ALL.length];
}

// Copia la imagen a la carpeta de subidas con un nombre nuevo (como las que suben los
// organizadores) y se la asigna al evento. La anterior se borra.
export async function setDemoImage(event: { id: string; name: string; imageFile: string | null }, index = 0) {
  const theme = themeFor(event.name, index);
  const file = `${randomBytes(16).toString("hex")}.jpg`;
  await mkdir(config.uploadDir, { recursive: true });
  await copyFile(path.join(DIR, `${theme}.jpg`), path.join(config.uploadDir, file));
  await prisma.event.update({ where: { id: event.id }, data: { imageFile: file } });
  await deleteImage(event.imageFile);
  return theme;
}

async function main() {
  const events = await prisma.event.findMany({ orderBy: { startsAt: "asc" }, select: { id: true, name: true, imageFile: true } });
  if (events.length === 0) return console.log("No hay eventos en la base.");
  for (const [i, event] of events.entries()) console.log(`${event.name} → ${await setDemoImage(event, i)}`);
  console.log(`Listo: se cambió la imagen de ${events.length} eventos.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
  await prisma.$disconnect();
}
