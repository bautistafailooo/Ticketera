// Configuración del servidor de envío de mails (SMTP), a partir de las variables del .env.
//
// Dos formas de configurarlo:
// - SMTP_HOST, SMTP_USER y SMTP_PASS (más fácil de escribir: la clave va tal cual).
// - SMTP_URL, todo en una línea: smtps://usuario:clave@servidor:465
// Sin ninguna de las dos, los mails no se envían: se guardan en mail-outbox/.

type Env = Record<string, string | undefined>;

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
};

export function smtpSettings(env: Env): SmtpSettings | string | null {
  const host = env.SMTP_HOST?.trim();
  if (host) {
    const port = Number(env.SMTP_PORT ?? 465);
    const user = env.SMTP_USER?.trim();
    let pass = env.SMTP_PASS ?? "";
    // Gmail muestra las contraseñas de aplicación en grupos ("abcd efgh ijkl mnop"): van sin espacios.
    if (host === "smtp.gmail.com") pass = pass.replace(/\s+/g, "");
    return {
      host,
      port,
      // 465 = conexión cifrada desde el principio; 587 = se cifra después de conectar (STARTTLS).
      secure: port === 465,
      requireTLS: port === 587,
      ...(user ? { auth: { user, pass } } : {}),
    };
  }
  return env.SMTP_URL?.trim() || null;
}

// Remitente: MAIL_FROM, o si no está, la cuenta con la que se manda (Gmail no deja usar otro).
export function mailFromOf(env: Env): string {
  if (env.MAIL_FROM?.trim()) return env.MAIL_FROM.trim();
  const user = env.SMTP_USER?.trim() ?? "";
  if (user.includes("@")) return `ecko <${user}>`;
  return "ecko <no-responder@ecko.local>";
}

// Para mostrar al arrancar, sin la clave.
export function describeSmtp(settings: SmtpSettings | string): string {
  if (typeof settings !== "string") return `${settings.host}:${settings.port}`;
  try {
    const url = new URL(settings);
    return `${url.hostname}:${url.port || (url.protocol === "smtps:" ? 465 : 587)}`;
  } catch {
    return "SMTP_URL";
  }
}

// Traduce los errores más comunes del envío a algo que se entienda.
export function explainMailError(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const text = `${e.response ?? ""} ${e.message ?? ""}`;
  if (e.code === "EAUTH" || e.responseCode === 535) {
    return "El servidor rechazó el usuario o la clave (SMTP_USER / SMTP_PASS). Con Gmail tiene que ser una contraseña de aplicación, no tu contraseña normal.";
  }
  if (/only send testing emails to your own email|verify a domain/i.test(text)) {
    return "Resend sin dominio verificado solo manda mails a tu propio email (el de la cuenta de Resend). Para mandar a cualquiera hay que verificar un dominio.";
  }
  if (/domain is not verified|not verified/i.test(text)) {
    return "El dominio del remitente (MAIL_FROM) no está verificado en el proveedor.";
  }
  if (e.code === "EDNS" || e.code === "ENOTFOUND") return "No se encontró el servidor de mails: revisá SMTP_HOST.";
  if (e.code === "ETIMEDOUT" || e.code === "ECONNECTION" || e.code === "ESOCKET") {
    return "No se pudo conectar al servidor de mails: revisá SMTP_HOST y SMTP_PORT (465 o 587) y tu conexión a internet.";
  }
  return e.message ?? String(err);
}
