import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
import helmet from "helmet";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { config } from "./config.js";

// Cabeceras de seguridad. Los scripts solo pueden venir del propio sitio.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // blob: para la vista previa del flyer antes de subirlo.
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  // En desarrollo se sirve por http; HSTS solo tiene sentido en producción.
  strictTransportSecurity: config.isProduction,
});

function limiter(windowMinutes: number, limit: number, message: string, key?: (req: Request) => string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => !config.rateLimits,
    keyGenerator: key ?? ((req) => ipKeyGenerator(req.ip ?? "")),
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

const TOO_MANY = "Demasiados intentos. Esperá unos minutos y probá de nuevo.";

export const rateLimits = {
  // Tope general por IP para cualquier pedido a la API.
  api: limiter(1, 300, TOO_MANY),
  // Login y registro por IP.
  auth: limiter(15, 20, TOO_MANY),
  // Login por cuenta: frena a quien prueba contraseñas desde muchas IPs.
  loginPerAccount: limiter(15, 10, TOO_MANY, (req) =>
    `login:${String(req.body?.email ?? "").trim().toLowerCase()}`,
  ),
  // Compras por IP: evita que alguien bloquee el cupo creando órdenes sin parar.
  orders: limiter(10, 20, "Hiciste demasiadas compras seguidas. Esperá unos minutos."),
  // "Olvidé mi contraseña": por IP y por email, para no usarlo para mandar spam.
  forgotPassword: limiter(15, 5, TOO_MANY),
  forgotPasswordPerEmail: limiter(60, 3, TOO_MANY, (req) =>
    `forgot:${String(req.body?.email ?? "").trim().toLowerCase()}`,
  ),
  // Reenvío de entradas por mail: pocas veces por orden.
  resendTickets: limiter(60, 3, "Ya te reenviamos las entradas varias veces. Probá más tarde.", (req) =>
    `resend:${String(req.params?.id ?? "")}`,
  ),
  // Validaciones de puerta por link: una puerta con mucho movimiento hace ~1 por segundo.
  door: limiter(1, 120, TOO_MANY, (req) => `door:${req.header("x-door-token") ?? ipKeyGenerator(req.ip ?? "")}`),
};

// --- Sitio privado ---
// Con SITE_PASSWORD, todo el sitio pide usuario y contraseña del navegador (cualquier usuario
// sirve, lo que importa es la contraseña). Sirve para tenerlo online sin que entre cualquiera.

const digest = (text: string) => createHash("sha256").update(text).digest();

function passwordFrom(req: Request) {
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  return colon === -1 ? null : decoded.slice(colon + 1);
}

// Cuenta solo los intentos fallidos, para frenar a quien prueba contraseñas.
const gateFailures = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  skip: () => !config.sitePassword || !config.rateLimits,
  keyGenerator: (req) => `gate:${ipKeyGenerator(req.ip ?? "")}`,
  handler: (_req, res) => {
    res.status(429).send("Demasiados intentos. Esperá unos minutos.");
  },
});

const privateGate: RequestHandler = (req, res, next) => {
  const expected = config.sitePassword;
  // /health para el monitoreo y las notificaciones de Mercado Pago, que no saben la contraseña.
  if (!expected || req.path === "/health" || req.path === "/payments/mercadopago/webhook") return next();
  // Que los buscadores no indexen el sitio mientras es privado.
  res.set("X-Robots-Tag", "noindex, nofollow");
  const given = passwordFrom(req);
  if (given !== null && timingSafeEqual(digest(given), digest(expected))) return next();
  res.set("WWW-Authenticate", 'Basic realm="ecko (privado)", charset="UTF-8"');
  res.status(401).send("Sitio en pruebas: pedí la contraseña a quien administra ecko.");
};

export const sitePrivacy: RequestHandler[] = [gateFailures, privateGate];
