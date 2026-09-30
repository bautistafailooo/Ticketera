import type { Request } from "express";
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
  // Validaciones de puerta por link: una puerta con mucho movimiento hace ~1 por segundo.
  door: limiter(1, 120, TOO_MANY, (req) => `door:${req.header("x-door-token") ?? ipKeyGenerator(req.ip ?? "")}`),
};
