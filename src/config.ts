import "dotenv/config";

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
  // Permite desactivar los límites de pedidos en los tests.
  rateLimits: env.RATE_LIMITS !== "off",
};
