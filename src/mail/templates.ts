// Plantillas de los mails. Todo el texto que cargan los usuarios pasa por esc().

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "America/Argentina/Buenos_Aires",
});
export const formatDate = (date: Date) => `${dateFormatter.format(date)} h`;

// Igual que en el sitio: sin centavos si el monto es redondo ("$ 36.000"), con dos si no ("$ 1.500,50").
export const formatPrice = (cents: number) =>
  cents === 0
    ? "Gratis"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(cents / 100);

// Estructura común: fondo oscuro, logo y una tarjeta clara con el contenido (se lee bien en cualquier cliente).
function layout({ preheader, body }: { preheader: string; body: string }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background:#0b0b12">
  <div style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b12">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 4px 20px;font:800 30px/1 Arial,Helvetica,sans-serif;color:#ff4d8d;letter-spacing:-1px">ecko</td></tr>
        <tr><td style="background:#ffffff;border-radius:16px;padding:32px 28px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1b1b24">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 4px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#8a8aa3">
          Recibiste este mail por una acción en ecko. Si no fuiste vos, podés ignorarlo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const h1 = (text: string) => `<h1 style="margin:0 0 12px;font:800 24px/1.2 Arial,Helvetica,sans-serif;color:#0b0b12">${text}</h1>`;
const p = (html: string, style = "") => `<p style="margin:0 0 14px;${style}">${html}</p>`;
const button = (url: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="background:#e8336f;border-radius:999px">
    <a href="${esc(url)}" style="display:inline-block;padding:13px 26px;font:700 16px Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${esc(label)}</a>
  </td></tr></table>`;
const muted = (html: string) => p(html, "color:#6b6b80;font-size:14px");

type OrderMail = {
  buyerName: string;
  totalCents: number;
  orderUrl: string;
  event: { name: string; venue: string; startsAt: Date };
  tickets: { ticketType: string; code: string; cid: string }[];
};

export function orderConfirmed(order: OrderMail) {
  const tickets = order.tickets
    .map(
      (t, i) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e4e4ee;border-radius:12px">
      <tr>
        <td style="padding:16px;vertical-align:middle">
          <div style="font-size:12px;color:#8a8aa3">Entrada ${i + 1} de ${order.tickets.length}</div>
          <div style="font:800 20px Arial,Helvetica,sans-serif;margin:2px 0 6px">${esc(t.ticketType)}</div>
          <div style="font:700 16px 'Courier New',monospace;letter-spacing:1px">${esc(t.code)}</div>
        </td>
        <td width="150" style="padding:12px;text-align:right;vertical-align:middle">
          <img src="cid:${esc(t.cid)}" width="130" height="130" alt="QR de la entrada ${esc(t.code)}" style="display:block;margin-left:auto">
        </td>
      </tr>
    </table>`,
    )
    .join("");

  const html = layout({
    preheader: `Tus entradas para ${order.event.name}`,
    body: `
      ${h1("¡Tus entradas están listas!")}
      ${p(`Hola ${esc(order.buyerName)}, tu compra para <b>${esc(order.event.name)}</b> está confirmada.`)}
      ${p(`<b>Cuándo:</b> ${esc(formatDate(order.event.startsAt))}<br><b>Dónde:</b> ${esc(order.event.venue)}<br><b>Total:</b> ${esc(formatPrice(order.totalCents))}`)}
      ${muted("Mostrá el QR de cada entrada en la puerta. Si no se puede escanear, dictá el código.")}
      ${tickets}
      ${button(order.orderUrl, "Ver mis entradas")}
      ${muted("No reenvíes este mail: quien tenga los códigos puede usar las entradas.")}`,
  });
  const text = [
    `¡Tus entradas están listas!`,
    `${order.event.name} — ${formatDate(order.event.startsAt)} — ${order.event.venue}`,
    ...order.tickets.map((t, i) => `Entrada ${i + 1}: ${t.ticketType} — código ${t.code}`),
    `Ver tus entradas: ${order.orderUrl}`,
  ].join("\n");
  return { subject: `Tus entradas para ${order.event.name}`, html, text };
}

export function passwordReset({ name, url }: { name: string; url: string }) {
  const html = layout({
    preheader: "Creá una contraseña nueva",
    body: `
      ${h1("Creá una contraseña nueva")}
      ${p(`Hola ${esc(name)}, pediste cambiar la contraseña de tu cuenta de organizador.`)}
      ${button(url, "Elegir contraseña nueva")}
      ${muted("El link vale por una hora y sirve una sola vez. Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual.")}`,
  });
  return {
    subject: "Cambiá tu contraseña de ecko",
    html,
    text: `Para elegir una contraseña nueva entrá a: ${url}\nEl link vale por una hora. Si no lo pediste, ignorá este mail.`,
  };
}

type ReviewKind = "approved" | "rejected" | "paused" | "resumed";

export function eventReviewed({ name, eventName, kind, note, url }: { name: string; eventName: string; kind: ReviewKind; note?: string | null; url: string }) {
  const copy = {
    approved: { subject: `Tu evento "${eventName}" ya está a la venta`, title: "¡Evento aprobado!", text: "ya está publicado y a la venta en la cartelera." },
    rejected: { subject: `Tu evento "${eventName}" necesita cambios`, title: "Tu evento necesita cambios", text: "no fue aprobado todavía. Corregilo y volvé a enviarlo a revisión." },
    paused: { subject: `Tu evento "${eventName}" fue pausado`, title: "Tu evento fue pausado", text: "salió de la cartelera y dejó de vender. Las entradas ya vendidas siguen valiendo." },
    resumed: { subject: `Tu evento "${eventName}" volvió a la venta`, title: "Tu evento volvió a la venta", text: "está otra vez publicado en la cartelera." },
  }[kind];
  const html = layout({
    preheader: copy.subject,
    body: `
      ${h1(copy.title)}
      ${p(`Hola ${esc(name)}, tu evento <b>${esc(eventName)}</b> ${copy.text}`)}
      ${note ? p(`<b>Motivo:</b> ${esc(note)}`, "background:#fff4f6;border-left:4px solid #e8336f;padding:12px 14px;border-radius:8px") : ""}
      ${button(url, "Ir al evento en el panel")}`,
  });
  return { subject: copy.subject, html, text: `${copy.title}: ${eventName}${note ? `\nMotivo: ${note}` : ""}\n${url}` };
}

export function eventPendingReview({ eventName, organizerName, url }: { eventName: string; organizerName: string; url: string }) {
  const html = layout({
    preheader: `${organizerName} envió un evento a revisión`,
    body: `
      ${h1("Hay un evento para revisar")}
      ${p(`<b>${esc(organizerName)}</b> envió <b>${esc(eventName)}</b> a revisión. No aparece en la cartelera hasta que lo apruebes.`)}
      ${button(url, "Revisar eventos")}`,
  });
  return { subject: `Evento para revisar: ${eventName}`, html, text: `${organizerName} envió "${eventName}" a revisión.\n${url}` };
}
