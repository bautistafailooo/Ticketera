import { config } from "./config.js";
import { prisma } from "./db.js";
import { MercadoPagoError, sellerToken } from "./payments/mercadopago.js";

// Muestra qué ve Mercado Pago de cada organizador conectado: su cuenta y sus últimos pagos
// (con el motivo si fueron rechazados). Uso: npm run mp:diagnostico
if (!config.mercadoPago) {
  console.log("Mercado Pago no está configurado (faltan MP_CLIENT_ID y MP_CLIENT_SECRET en el .env).");
  process.exit(1);
}
const { apiUrl, clientId } = config.mercadoPago;
console.log(`Aplicación (Client ID): ${clientId}`);
console.log(`Dirección pública: ${config.publicUrl}\n`);

async function get(path: string, token: string) {
  const res = await fetch(`${apiUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MercadoPagoError(res.status, body);
  return body as Record<string, any>;
}

// Motivos de rechazo más comunes (status_detail).
const MOTIVOS: Record<string, string> = {
  cc_rejected_other_reason: "la tarjeta rechazó el pago (con tarjeta de prueba: titular OTHE)",
  cc_rejected_high_risk: "Mercado Pago lo consideró riesgoso (prevención de fraude)",
  cc_rejected_bad_filled_security_code: "código de seguridad incorrecto",
  cc_rejected_bad_filled_date: "vencimiento incorrecto",
  cc_rejected_bad_filled_other: "algún dato de la tarjeta está mal",
  cc_rejected_insufficient_amount: "saldo insuficiente",
  cc_rejected_call_for_authorize: "la tarjeta pide autorizar el pago",
  rejected_by_regulations: "rechazado por reglas de Mercado Pago (por ejemplo, mezclar cuentas reales y de prueba)",
  rejected_high_risk: "rechazado por riesgo",
  accredited: "aprobado y acreditado",
};

const sellers = await prisma.user.findMany({ where: { mpAccessToken: { not: null } } });
if (sellers.length === 0) console.log("Ningún organizador conectó su cuenta de Mercado Pago todavía.");

for (const seller of sellers) {
  console.log(`=== Organizador ${seller.name} <${seller.email}> ===`);
  try {
    const token = await sellerToken(seller);
    const me = await get("/users/me", token);
    const test = (me.tags ?? []).includes("test_user");
    console.log(`Cuenta de Mercado Pago: ${me.nickname} (User ID ${me.id}, ${me.site_id})${test ? " · CUENTA DE PRUEBA" : " · cuenta real"}`);

    const search = await get("/v1/payments/search?sort=date_created&criteria=desc&limit=5", token);
    const payments = (search.results ?? []) as Record<string, any>[];
    if (payments.length === 0) console.log("Sin pagos todavía (Mercado Pago no llegó a crear ningún pago para esta cuenta).");
    for (const p of payments) {
      const motivo = MOTIVOS[p.status_detail] ?? "";
      console.log(
        `- Pago ${p.id} · ${new Date(p.date_created).toLocaleString("es-AR")} · $${p.transaction_amount} · ` +
          `${p.status} (${p.status_detail})${motivo ? ` → ${motivo}` : ""}\n` +
          `  medio: ${p.payment_method_id ?? "?"} · pagador: ${p.payer?.email ?? "?"} (ID ${p.payer?.id ?? "?"}) · orden: ${p.external_reference ?? "-"}`,
      );
    }
  } catch (err) {
    console.log(`No se pudo consultar: ${err instanceof Error ? err.message : err}`);
  }
  console.log();
}
await prisma.$disconnect();
