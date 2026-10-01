import { config } from "../config.js";

// Cargo por servicio (la comisión de ecko) sobre el valor de las entradas, redondeado a pesos enteros.
// La misma cuenta está en public/js/common.js (serviceFee) para mostrar el total antes de comprar.
export function serviceFee(subtotalCents: number, percent = config.serviceFeePercent) {
  return Math.round((subtotalCents * percent) / 100 / 100) * 100;
}
