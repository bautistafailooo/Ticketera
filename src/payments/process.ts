import { prisma } from "../db.js";
import { sendOrderConfirmation, sendOrderRefunded, sendPaymentRefunded } from "../mail/messages.js";
import { sendInBackground } from "../mail/transport.js";
import { getPayment, MercadoPagoError, refundPayment, searchPayments, sellerToken, type Payment } from "./mercadopago.js";

// Confirma las órdenes con los pagos de Mercado Pago.
//
// Nunca se confía en lo que manda el navegador o la notificación: el pago siempre se
// consulta a Mercado Pago con el token del organizador, y se verifica que sea de esta
// orden, que esté aprobado y que el monto coincida.

type Outcome = "paid" | "already" | "refunded" | "ignored";

class NoCapacity extends Error {}

// Pasa la orden a pagada (sirve también para el pago simulado). Devuelve false si ya no estaba pendiente.
export async function markOrderPaid(orderId: string, mpPaymentId?: string) {
  const paid = await prisma.order.updateMany({
    where: { id: orderId, status: "PENDING", mpPaymentId: null },
    data: { status: "PAID", paidAt: new Date(), ...(mpPaymentId ? { mpPaymentId } : {}) },
  });
  if (paid.count === 0) return false;
  sendInBackground("entradas", () => sendOrderConfirmation(orderId));
  return true;
}

async function refund(token: string, orderId: string, paymentId: string, reason: string) {
  try {
    await refundPayment(token, paymentId);
  } catch (err) {
    console.error(`DEVOLVER A MANO: no se pudo devolver el pago ${paymentId} de la orden ${orderId} (${reason}).`, err);
    return;
  }
  console.log(`Pago ${paymentId} de la orden ${orderId} devuelto: ${reason}.`);
  return true;
}

export async function applyPayment(orderId: string, payment: Payment, token: string): Promise<Outcome> {
  const paymentId = String(payment.id);
  if (payment.external_reference !== orderId) return "ignored";
  // Devuelto desde Mercado Pago (por el organizador) o contracargo: la compra se anula.
  if (payment.status === "refunded" || payment.status === "charged_back") return voidOrder(orderId, paymentId, payment.status);
  if (payment.status !== "approved") {
    const detail = (payment as { status_detail?: string }).status_detail;
    console.log(`Pago ${paymentId} de la orden ${orderId}: ${payment.status}${detail ? ` (${detail})` : ""}.`);
    return "ignored";
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return "ignored";
  if (Math.round(payment.transaction_amount * 100) !== order.totalCents || payment.currency_id !== "ARS") {
    console.error(`El pago ${paymentId} no coincide con el total de la orden ${orderId}: no se confirma.`);
    return "ignored";
  }
  if (order.mpPaymentId === paymentId) return "already";

  // Ya estaba paga (con otro pago): este sobra y se devuelve.
  if (order.status === "PAID" || order.mpPaymentId) {
    await refund(token, orderId, paymentId, "pago duplicado");
    return "refunded";
  }

  if (order.status === "PENDING") {
    if (await markOrderPaid(orderId, paymentId)) return "paid";
    return applyPayment(orderId, payment, token); // cambió mientras tanto: se vuelve a evaluar
  }

  // El pago llegó después de que la reserva venció: si todavía hay lugar, se vuelven a reservar
  // las entradas y la orden queda paga. Si no, se devuelve la plata.
  if (order.status === "EXPIRED") {
    try {
      await prisma.$transaction(async (tx) => {
        const perType = await tx.ticket.groupBy({ by: ["ticketTypeId"], where: { orderId }, _count: true });
        for (const { ticketTypeId, _count } of perType) {
          const type = await tx.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
          const reserved = await tx.ticketType.updateMany({
            where: { id: ticketTypeId, sold: { lte: type.capacity - _count } },
            data: { sold: { increment: _count } },
          });
          if (reserved.count === 0) throw new NoCapacity();
        }
        const paid = await tx.order.updateMany({
          where: { id: orderId, status: "EXPIRED", mpPaymentId: null },
          data: { status: "PAID", paidAt: new Date(), mpPaymentId: paymentId },
        });
        if (paid.count === 0) throw new NoCapacity();
      });
      sendInBackground("entradas", () => sendOrderConfirmation(orderId));
      return "paid";
    } catch (err) {
      if (!(err instanceof NoCapacity)) throw err;
    }
  }

  // Vencida sin lugar, o cancelada: se devuelve. Se anota el pago primero para hacerlo una sola vez.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, mpPaymentId: null, status: { not: "PAID" } },
    data: { mpPaymentId: paymentId },
  });
  if (claimed.count === 0) return applyPayment(orderId, payment, token);
  if (await refund(token, orderId, paymentId, "llegó tarde y ya no había lugar")) {
    await prisma.order.update({ where: { id: orderId }, data: { refundedAt: new Date() } });
    sendInBackground("pago devuelto", () => sendPaymentRefunded(orderId));
  }
  return "refunded";
}

// El pago de una compra confirmada se devolvió (desde la cuenta de Mercado Pago del organizador)
// o tuvo un contracargo: la compra queda anulada, sus entradas dejan de valer en la puerta, los
// lugares que no se usaron vuelven a estar a la venta y se le avisa al comprador.
async function voidOrder(orderId: string, paymentId: string, status: string): Promise<Outcome> {
  const voided = await prisma.$transaction(async (tx) => {
    const changed = await tx.order.updateMany({
      where: { id: orderId, status: "PAID", mpPaymentId: paymentId },
      data: { status: "CANCELLED", refundedAt: new Date() },
    });
    if (changed.count === 0) return false;
    const perType = await tx.ticket.groupBy({ by: ["ticketTypeId"], where: { orderId, usedAt: null }, _count: true });
    for (const { ticketTypeId, _count } of perType) {
      await tx.ticketType.update({ where: { id: ticketTypeId }, data: { sold: { decrement: _count } } });
    }
    return true;
  });
  if (!voided) return "ignored";
  console.log(`Orden ${orderId} anulada: el pago ${paymentId} quedó ${status === "refunded" ? "devuelto" : "con contracargo"}.`);
  sendInBackground("compra anulada", () => sendOrderRefunded(orderId));
  return "refunded";
}

// Consulta los pagos de una orden en Mercado Pago y la actualiza.
// Con paymentId (de la notificación o de la vuelta del checkout) consulta ese pago;
// sin él, busca los pagos de la orden.
export async function syncOrderPayments(orderId: string, paymentId?: string): Promise<Outcome> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { event: { include: { organizer: true } } } });
  const seller = order?.event.organizer;
  if (!order || !seller) return "ignored";
  const token = await sellerToken(seller);

  let payments: Payment[];
  try {
    payments = paymentId ? [await getPayment(token, paymentId)] : await searchPayments(token, orderId);
  } catch (err) {
    // Un pago que no es de este organizador no aparece: no es de esta orden.
    if (err instanceof MercadoPagoError && err.status === 404) return "ignored";
    throw err;
  }

  let result: Outcome = "ignored";
  for (const payment of payments) {
    const outcome = await applyPayment(orderId, payment, token);
    if (outcome !== "ignored" && result !== "paid") result = outcome;
  }
  return result;
}
