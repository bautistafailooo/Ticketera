import "dotenv/config";
import path from "node:path";
import { mailFromOf, smtpSettings } from "./mail/smtp.js";

const env = process.env;
const isProduction = env.NODE_ENV === "production";

export const config = {
  isProduction,
  port: Number(env.PORT ?? 3000),
  // Minutos que tiene un comprador para pagar antes de que la orden venza y libere el cupo.
  orderTtlMinutes: Number(env.ORDER_TTL_MINUTES ?? 15),
  // El pago simulado solo existe para desarrollo; en producción está apagado salvo que se active a propósito.
  simulatedPayments: env.SIMULATED_PAYMENTS ? env.SIMULATED_PAYMENTS === "true" : !isProduction,
  // Cantidad de proxies delante del servidor (para leer la IP real en los límites de pedidos).
  trustProxy: Number(env.TRUST_PROXY ?? 0),
  // Carpeta donde se guardan los flyers de los eventos. En producción tiene que ser un disco persistente.
  uploadDir: path.resolve(env.UPLOAD_DIR ?? "uploads"),
  // Dirección pública del sitio, para los links de los mails (ej. https://ecko.com.ar).
  publicUrl: (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, ""),
  // Remitente de los mails (si falta, la cuenta de SMTP_USER).
  mailFrom: mailFromOf(env),
  // Servidor de envío (SMTP_HOST/SMTP_USER/SMTP_PASS o SMTP_URL, ver src/mail/smtp.ts). Sin esto,
  // los mails se guardan como archivos en mailOutboxDir para verlos en el navegador.
  smtp: smtpSettings(env),
  mailOutboxDir: path.resolve(env.MAIL_OUTBOX_DIR ?? "mail-outbox"),
  // "memory" guarda los mails en memoria (tests).
  mailTransport: env.MAIL_TRANSPORT,
  // Clave opcional de la API de mapas embebidos de Google (Maps Embed API, gratuita).
  googleMapsEmbedKey: env.GOOGLE_MAPS_EMBED_KEY?.trim() || undefined,
  // Cargo por servicio que paga el comprador, en % del valor de las entradas (la comisión de ecko).
  serviceFeePercent: Number(env.SERVICE_FEE_PERCENT ?? 10),
  // Aplicación de Mercado Pago de ecko (ver MERCADOPAGO.md). Sin esto, no se cobra con Mercado Pago.
  mercadoPago: env.MP_CLIENT_ID && env.MP_CLIENT_SECRET
    ? {
        clientId: env.MP_CLIENT_ID.trim(),
        clientSecret: env.MP_CLIENT_SECRET.trim(),
        // Usar el checkout de pruebas (sandbox_init_point) en lugar del normal.
        sandbox: env.MP_SANDBOX === "true",
        apiUrl: (env.MP_API_URL ?? "https://api.mercadopago.com").replace(/\/$/, ""),
        authUrl: (env.MP_AUTH_URL ?? "https://auth.mercadopago.com").replace(/\/$/, ""),
      }
    : null,
  // La cuenta con este email queda como administrador (al registrarse o al arrancar el servidor).
  adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() || undefined,
  // Si está, todo el sitio pide esta contraseña (para tenerlo online en privado mientras se prueba).
  sitePassword: env.SITE_PASSWORD || undefined,
  // Carpeta de las copias de seguridad diarias de la base. Vacío = sin copias.
  backupDir: env.BACKUP_DIR ? path.resolve(env.BACKUP_DIR) : undefined,
  // Permite desactivar los límites de pedidos en los tests.
  rateLimits: env.RATE_LIMITS !== "off",
};
