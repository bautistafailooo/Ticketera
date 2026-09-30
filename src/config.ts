import "dotenv/config";
import path from "node:path";

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
  // Remitente de los mails.
  mailFrom: env.MAIL_FROM ?? "ecko <no-responder@ecko.local>",
  // Servidor de envío, ej. smtps://usuario:clave@smtp.resend.com:465. Sin esto,
  // los mails se guardan como archivos en mailOutboxDir para verlos en el navegador.
  smtpUrl: env.SMTP_URL,
  mailOutboxDir: path.resolve(env.MAIL_OUTBOX_DIR ?? "mail-outbox"),
  // "memory" guarda los mails en memoria (tests).
  mailTransport: env.MAIL_TRANSPORT,
  // Permite desactivar los límites de pedidos en los tests.
  rateLimits: env.RATE_LIMITS !== "off",
};
