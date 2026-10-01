import { Router } from "express";
import { config } from "../config.js";
import { syncOrderPayments } from "../payments/process.js";

// Notificaciones de Mercado Pago ("webhooks"). Avisan que cambió un pago; no se confía en su
// contenido: el pago se consulta a Mercado Pago con el token del organizador de la orden.
export const paymentsRouter = Router();

paymentsRouter.post("/mercadopago/webhook", async (req, res) => {
  const orderId = typeof req.query.order === "string" ? req.query.order : "";
  const body = (req.body ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: unknown } };
  const type = body.type ?? body.topic ?? req.query.type ?? req.query.topic;
  const paymentId = String(body.data?.id ?? req.query["data.id"] ?? req.query.id ?? "");

  // Otras notificaciones (por ejemplo de "merchant_order") no hacen falta: se responde 200 para que no reintente.
  if (!config.mercadoPago || type !== "payment" || !/^\d{1,20}$/.test(paymentId) || !/^[\w-]{1,50}$/.test(orderId)) {
    res.sendStatus(200);
    return;
  }
  try {
    await syncOrderPayments(orderId, paymentId);
    res.sendStatus(200);
  } catch (err) {
    // Con un error, Mercado Pago vuelve a mandar la notificación más tarde.
    console.error(`No se pudo procesar la notificación del pago ${paymentId} (orden ${orderId})`, err);
    res.sendStatus(500);
  }
});
