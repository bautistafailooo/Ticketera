import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "express";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { onSaleWhere } from "./events.js";
import { withLots } from "./lots.js";
import { publicProfile } from "./routes/organizers.js";
import { esc, formatDate, formatPrice } from "./mail/templates.js";

// Vista previa al compartir un link (WhatsApp, Instagram, Telegram, X…). Esas apps no ejecutan
// JavaScript: leen las etiquetas <meta property="og:…"> del HTML. Por eso la portada y la página
// de cada evento se sirven con esas etiquetas ya completas (flyer, nombre, fecha y lugar).

const PUBLIC_DIR = path.join(import.meta.dirname, "../public");
const DEFAULT_IMAGE = "/og.png";

type Preview = { title: string; description: string; image: string; url: string };

function metaTags(p: Preview) {
  const tags = {
    "og:type": "website",
    "og:site_name": "ecko",
    "og:locale": "es_AR",
    "og:title": p.title,
    "og:description": p.description,
    "og:url": p.url,
    "og:image": p.image,
    "twitter:card": "summary_large_image",
  };
  return [
    `<meta name="description" content="${esc(p.description)}">`,
    ...Object.entries(tags).map(([key, value]) =>
      key.startsWith("twitter:") ? `<meta name="${key}" content="${esc(value)}">` : `<meta property="${key}" content="${esc(value)}">`,
    ),
  ].join("\n  ");
}

async function eventPreview(id: string): Promise<Preview | null> {
  const event = await prisma.event.findFirst({
    where: { id, ...onSaleWhere() },
    select: {
      id: true,
      name: true,
      venue: true,
      startsAt: true,
      imageFile: true,
      ticketTypes: { select: { id: true, name: true, priceCents: true, capacity: true, sold: true, salesEndAt: true, opensAfterId: true } },
    },
  });
  if (!event) return null;
  // "Desde": el precio más bajo de lo que está a la venta ahora (no de un lote ya terminado).
  const lots = withLots(event.ticketTypes);
  const onSale = lots.filter((t) => t.status === "onsale");
  const prices = (onSale.length ? onSale : lots).map((t) => t.priceCents);
  const from = prices.length ? Math.min(...prices) : null;
  const date = formatDate(event.startsAt);
  return {
    title: event.name,
    description: [date.charAt(0).toUpperCase() + date.slice(1), event.venue, from === null ? null : from === 0 ? "Entrada gratis" : `Desde ${formatPrice(from)}`]
      .filter(Boolean)
      .join(" · "),
    image: `${config.publicUrl}${event.imageFile ? `/media/${encodeURIComponent(event.imageFile)}` : DEFAULT_IMAGE}`,
    url: `${config.publicUrl}/evento.html?id=${encodeURIComponent(event.id)}`,
  };
}

async function organizerPreview(id: string): Promise<Preview | null> {
  const profile = await publicProfile(id);
  if (!profile) return null;
  const count = profile.events.length;
  return {
    title: `${profile.name} en ecko`,
    description: profile.bio?.slice(0, 200) || (count ? `${count} ${count === 1 ? "evento" : "eventos"} a la venta. Comprá tus entradas en ecko.` : "Organizador en ecko."),
    image: `${config.publicUrl}${profile.events.find((e) => e.imageFile) ? `/media/${encodeURIComponent(profile.events.find((e) => e.imageFile)!.imageFile!)}` : DEFAULT_IMAGE}`,
    url: `${config.publicUrl}/organizador.html?id=${encodeURIComponent(profile.id)}`,
  };
}

const sitePreview = (): Preview => ({
  title: "ecko · Entradas para eventos",
  description: "Entradas para recitales, fiestas, teatro y más. Comprá en minutos y recibí tu QR al instante.",
  image: `${config.publicUrl}${DEFAULT_IMAGE}`,
  url: `${config.publicUrl}/`,
});

async function render(file: string, preview: Preview, title?: string) {
  let html = await readFile(path.join(PUBLIC_DIR, file), "utf8");
  // La descripción genérica de la página se reemplaza por la del link.
  html = html.replace(/\s*<meta name="description"[^>]*>/, "");
  if (title) html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  return html.replace("</title>", `</title>\n  ${metaTags(preview)}`);
}

export const sharePreviews: RequestHandler = async (req, res, next) => {
  try {
    let html: string;
    if (req.path === "/" || req.path === "/index.html") {
      html = await render("index.html", sitePreview());
    } else if (req.path === "/evento.html") {
      const id = typeof req.query.id === "string" ? req.query.id.slice(0, 50) : "";
      const preview = id ? await eventPreview(id) : null;
      if (!preview) return next();
      html = await render("evento.html", preview, `${preview.title} · ecko`);
    } else if (req.path === "/organizador.html") {
      const id = typeof req.query.id === "string" ? req.query.id.slice(0, 50) : "";
      const preview = id ? await organizerPreview(id) : null;
      if (!preview) return next();
      html = await render("organizador.html", preview, `${preview.title.replace(/ en ecko$/, "")} · ecko`);
    } else {
      return next();
    }
    res.set("Cache-Control", "no-cache").type("html").send(html);
  } catch (err) {
    next(err);
  }
};
