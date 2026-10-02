import { config } from "../config.js";
import { prisma } from "../db.js";
import { HttpError } from "../errors.js";
import { decrypt, encrypt } from "./crypto.js";

// Cliente de la API de Mercado Pago (https://www.mercadopago.com.ar/developers).
//
// Modelo "split": cada organizador conecta su cuenta con OAuth. Los pagos se crean con el
// token del organizador, así la plata va a su cuenta, y Mercado Pago le descuenta
// marketplace_fee (el cargo por servicio), que llega a la cuenta de ecko.

export function mp() {
  if (!config.mercadoPago) throw new HttpError(503, "Mercado Pago no está configurado");
  return config.mercadoPago;
}

export class MercadoPagoError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`Mercado Pago respondió ${status}: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  const res = await fetch(`${mp().apiUrl}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // respuesta sin JSON
  }
  if (!res.ok) throw new MercadoPagoError(res.status, body);
  return body as T;
}

// ---------- Conexión de la cuenta del organizador (OAuth) ----------

export const oauthRedirectUri = () => `${config.publicUrl}/organizer/mercadopago/callback`;

export function authorizationUrl(state: string) {
  const url = new URL(`${mp().authUrl}/authorization`);
  url.searchParams.set("client_id", mp().clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  return url.toString();
}

type TokenResponse = { access_token: string; refresh_token: string; user_id: number | string; expires_in: number };

async function saveTokens(userId: string, tokens: TokenResponse) {
  const secret = mp().clientSecret;
  await prisma.user.update({
    where: { id: userId },
    data: {
      mpUserId: String(tokens.user_id),
      mpAccessToken: encrypt(tokens.access_token, secret),
      mpRefreshToken: encrypt(tokens.refresh_token, secret),
      mpTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

export async function connectAccount(userId: string, code: string) {
  const tokens = await call<TokenResponse>("/oauth/token", {
    method: "POST",
    body: {
      client_id: mp().clientId,
      client_secret: mp().clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: oauthRedirectUri(),
    },
  });
  await saveTokens(userId, tokens);
  await prisma.user.update({ where: { id: userId }, data: { mpConnectedAt: new Date() } });
}

export async function disconnectAccount(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { mpUserId: null, mpAccessToken: null, mpRefreshToken: null, mpTokenExpiresAt: null, mpConnectedAt: null },
  });
}

type Seller = { id: string; mpAccessToken: string | null; mpRefreshToken: string | null; mpTokenExpiresAt: Date | null };

// Token del organizador para cobrar. Lo renueva si vence en menos de 30 días (duran 180).
export async function sellerToken(seller: Seller): Promise<string> {
  const secret = mp().clientSecret;
  const token = seller.mpAccessToken && decrypt(seller.mpAccessToken, secret);
  if (!token) throw new HttpError(409, "El organizador todavía no conectó su cuenta de Mercado Pago");
  const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (!seller.mpTokenExpiresAt || seller.mpTokenExpiresAt.getTime() > soon) return token;

  const refresh = seller.mpRefreshToken && decrypt(seller.mpRefreshToken, secret);
  if (!refresh) return token;
  try {
    const tokens = await call<TokenResponse>("/oauth/token", {
      method: "POST",
      body: { client_id: mp().clientId, client_secret: secret, grant_type: "refresh_token", refresh_token: refresh },
    });
    await saveTokens(seller.id, tokens);
    return tokens.access_token;
  } catch (err) {
    console.error("No se pudo renovar el token de Mercado Pago del organizador", seller.id, err);
    return token;
  }
}

// ---------- Cobros ----------

type PreferenceInput = {
  orderId: string;
  items: { title: string; quantity: number; unitPriceCents: number }[];
  feeCents: number;
  expiresAt: Date;
  returnUrl: string;
  notificationUrl: string;
};

export async function createPreference(token: string, input: PreferenceInput) {
  const https = input.returnUrl.startsWith("https://");
  const preference = await call<{ id: string; init_point: string; sandbox_init_point?: string }>("/checkout/preferences", {
    method: "POST",
    token,
    body: {
      items: input.items.map((i) => ({
        title: i.title.slice(0, 250),
        quantity: i.quantity,
        unit_price: i.unitPriceCents / 100,
        currency_id: "ARS",
      })),
      // Sin "payer": Mercado Pago le pide el email al comprador en su pantalla. Si se manda
      // un email que no es el de la cuenta con la que se paga, puede bloquear el pago
      // (con las cuentas de prueba, el botón "Pagar" queda deshabilitado).
      external_reference: input.orderId,
      marketplace_fee: input.feeCents / 100,
      // Las entradas están reservadas por pocos minutos: solo pagos que se aprueban o rechazan
      // en el momento (sin efectivo en Rapipago/Pago Fácil, que tarda días).
      binary_mode: true,
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
      expires: true,
      expiration_date_to: input.expiresAt.toISOString(),
      back_urls: { success: input.returnUrl, failure: input.returnUrl, pending: input.returnUrl },
      // Mercado Pago solo vuelve solo al sitio si la dirección es https.
      ...(https ? { auto_return: "approved" } : {}),
      notification_url: input.notificationUrl,
      statement_descriptor: "ECKO ENTRADAS",
    },
  });
  return preference;
}

export type Payment = {
  id: number | string;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
};

export const getPayment = (token: string, paymentId: string) =>
  call<Payment>(`/v1/payments/${encodeURIComponent(paymentId)}`, { token });

export async function searchPayments(token: string, orderId: string) {
  const res = await call<{ results: Payment[] }>(
    `/v1/payments/search?sort=date_created&criteria=desc&external_reference=${encodeURIComponent(orderId)}`,
    { token },
  );
  return res.results ?? [];
}

export const refundPayment = (token: string, paymentId: string) =>
  call(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    method: "POST",
    token,
    body: {},
    idempotencyKey: `refund-${paymentId}`,
  });
