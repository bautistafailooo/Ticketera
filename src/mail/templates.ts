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
  complimentary: boolean;
  totalCents: number;
  feeCents: number;
  event: { name: string; venue: string; address: string | null; startsAt: Date };
  directionsUrl: string | null;
  flyerCid: string | null;
  revocationUrl: string;
  tickets: { ticketType: string; code: string; cid: string }[];
};

const tz = "America/Argentina/Buenos_Aires";
const dayFormatter = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
const timeFormatter = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Mail de las entradas, oscuro como el sitio. Todo con tablas y estilos en línea para que se vea
// igual en Gmail, Outlook y el mail del celular. Los QR van sobre blanco para que se escaneen bien.
export function orderConfirmed(order: OrderMail) {
  const font = "Arial,Helvetica,sans-serif";
  const count = order.tickets.length;
  const when = capitalize(dayFormatter.format(order.event.startsAt));
  const time = `${timeFormatter.format(order.event.startsAt)} h`;
  const label = (text: string) =>
    `<div style="font:700 11px/1 ${font};letter-spacing:2px;text-transform:uppercase;color:#8a8aa3;margin:0 0 6px">${text}</div>`;

  // Cada entrada: arriba el tipo y a nombre de quién está; abajo el QR grande sobre blanco
  // (fácil de escanear en la puerta) y el código por si hay que dictarlo.
  const tickets = order.tickets
    .map(
      (t, i) => `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#1c1c2a" style="margin:0 0 18px;background:#1c1c2a;border:1px solid #2f2f45;border-radius:18px;border-collapse:separate">
        <tr><td style="padding:18px 20px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td valign="top">
              ${label(`Entrada ${i + 1} de ${count}`)}
              <div style="font:800 22px/1.2 ${font};color:#ffffff">${esc(t.ticketType)}</div>
            </td>
            <td valign="top" align="right">
              ${label("A nombre de")}
              <div style="font:700 16px/1.3 ${font};color:#ffffff">${esc(order.buyerName)}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 14px 14px;border-top:2px dashed #3a3a52">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="margin:14px 0 0;background:#ffffff;border-radius:14px">
            <tr><td align="center" style="padding:22px 16px 8px">
              <img src="cid:${esc(t.cid)}" width="260" height="260" alt="QR de la entrada ${esc(t.code)}" style="display:block;width:260px;max-width:100%;height:auto;border:0">
            </td></tr>
            <tr><td align="center" style="padding:4px 16px 20px">
              <div style="font:12px/1 ${font};color:#6b6b80;margin:0 0 6px">Código</div>
              <div style="font:700 20px/1.2 'Courier New',monospace;letter-spacing:2px;color:#14141f;white-space:nowrap">${esc(t.code)}</div>
            </td></tr>
          </table>
        </td></tr>
      </table>`,
    )
    .join("");

  const detail = (title: string, value: string, extra = "") => `
    <td valign="top" style="padding:0 10px 0 0">
      ${label(title)}
      <div style="font:700 15px/1.35 ${font};color:#ffffff">${value}</div>${extra}
    </td>`;

  const flyer = order.flyerCid
    ? `<td width="132" class="flyer-cell" valign="top" style="padding:0 20px 0 0"><img class="flyer" src="cid:${esc(order.flyerCid)}" width="132" alt="" style="display:block;width:132px;height:auto;border-radius:12px;border:0"></td>`
    : "";

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>
  @media (max-width: 480px) {
    .flyer-cell { width: 92px !important; padding-right: 14px !important; }
    .flyer { width: 92px !important; }
    .event-name { font-size: 22px !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:#0b0b12" bgcolor="#0b0b12">
  <div style="display:none;max-height:0;overflow:hidden">${esc(`${when}, ${time} · ${order.event.venue} · ${count} ${count === 1 ? "entrada" : "entradas"} con QR`)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0b12" style="background:#0b0b12">
    <tr><td align="center" style="padding:28px 14px 36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">

        <tr><td style="padding:0 6px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font:800 30px/1 ${font};color:#ff4d8d;letter-spacing:-1px">ecko</td>
            <td align="right" style="font:700 11px/1 ${font};letter-spacing:2px;text-transform:uppercase;color:#8a8aa3">${order.complimentary ? "Invitación" : "Compra confirmada"}</td>
          </tr></table>
        </td></tr>

        <tr><td bgcolor="#14141f" style="background:#14141f;border:1px solid #2a2a3d;border-radius:22px;overflow:hidden">
          <div style="height:4px;line-height:4px;font-size:0;background:#ff4d8d;background-image:linear-gradient(90deg,#ff4d8d,#b35cff,#6b7bff)">&nbsp;</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 26px 8px">

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              ${flyer}
              <td valign="middle">
                <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:#0f2e24;font:700 12px/1 ${font};color:#34d399;margin:0 0 14px">&#10003; ${order.complimentary ? "Te invitaron" : "Pago aprobado"}</div>
                <div class="event-name" style="font:800 28px/1.12 ${font};color:#ffffff;letter-spacing:-0.5px;margin:0 0 10px">${esc(order.event.name)}</div>
                <div style="font:15px/1.5 ${font};color:#b9b9cc">Hola ${esc(order.buyerName)}, ${order.complimentary ? "estas son tus entradas." : "¡ya tenés tus entradas!"}</div>
              </td>
            </tr></table>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0;border-top:1px solid #2a2a3d;border-bottom:1px solid #2a2a3d">
              <tr><td style="padding:18px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  ${detail("Fecha", esc(when))}
                  ${detail("Hora", esc(time))}
                </tr></table>
              </td></tr>
              <tr><td style="padding:0 0 18px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  ${detail(order.complimentary ? "Invitado/a" : "Comprador/a", esc(order.buyerName))}
                </tr></table>
              </td></tr>
              <tr><td style="padding:0 0 18px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                  ${detail(
                    "Lugar",
                    `${esc(order.event.venue)}${order.event.address ? `<br><span style="font-weight:400;color:#b9b9cc">${esc(order.event.address)}</span>` : ""}`,
                    order.directionsUrl
                      ? `<div style="margin:8px 0 0"><a href="${esc(order.directionsUrl)}" style="font:700 14px ${font};color:#c9b4ff;text-decoration:none">Ver cómo llegar &rarr;</a></div>`
                      : "",
                  )}
                </tr></table>
              </td></tr>
            </table>

            <div style="margin:26px 0 14px">${label(count === 1 ? "Tu entrada" : `Tus ${count} entradas`)}</div>
            ${tickets}

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;border-top:1px solid #2a2a3d">
              ${
                order.complimentary
                  ? `<tr><td style="padding:16px 0;font:15px ${font};color:#b9b9cc">Invitación</td><td align="right" style="padding:16px 0;font:800 18px ${font};color:#ffffff">Sin costo</td></tr>`
                  : `${
                      order.feeCents > 0
                        ? `<tr><td style="padding:16px 0 0;font:14px ${font};color:#8a8aa3">Cargo por servicio</td><td align="right" style="padding:16px 0 0;font:14px ${font};color:#8a8aa3">${esc(formatPrice(order.feeCents))}</td></tr>`
                        : ""
                    }
                    <tr><td style="padding:10px 0 16px;font:700 15px ${font};color:#ffffff">Total pagado</td><td align="right" style="padding:10px 0 16px;font:800 22px ${font};color:#ffffff">${esc(formatPrice(order.totalCents))}</td></tr>`
              }
            </table>

          </td></tr></table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#101019" style="background:#101019;border-top:1px solid #2a2a3d"><tr><td style="padding:22px 26px">
            ${label("En la puerta")}
            <table role="presentation" cellpadding="0" cellspacing="0" style="font:14px/1.5 ${font};color:#b9b9cc">
              <tr><td valign="top" style="padding:4px 10px 4px 0;color:#ff4d8d">&#9679;</td><td style="padding:4px 0">Mostrá el QR de cada entrada desde este mail, con el brillo del celular alto. Si son varias, cada persona muestra el suyo.</td></tr>
              <tr><td valign="top" style="padding:4px 10px 4px 0;color:#b35cff">&#9679;</td><td style="padding:4px 0">Cada QR vale para una persona y se puede usar una sola vez. Si no se puede escanear, dictá el código.</td></tr>
              <tr><td valign="top" style="padding:4px 10px 4px 0;color:#6b7bff">&#9679;</td><td style="padding:4px 0">No reenvíes ni publiques este mail: quien tenga los códigos puede usar las entradas.</td></tr>
            </table>
          </td></tr></table>
        </td></tr>

        <tr><td style="padding:22px 8px 0;font:12px/1.6 ${font};color:#6f6f8a;text-align:center">
          ${order.complimentary ? "Te llegó este mail porque te invitaron a un evento en ecko." : "Te llegó este mail porque compraste entradas en ecko."}<br>
          ${order.complimentary ? "" : `Si te arrepentiste de la compra, tenés 10 días: <a href="${esc(order.revocationUrl)}" style="color:#8a8aa3">Botón de arrepentimiento</a>.`}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    order.complimentary ? "¡Tenés una invitación!" : "¡Tus entradas están listas!",
    "",
    order.event.name,
    `${when}, ${time}`,
    `${order.event.venue}${order.event.address ? `, ${order.event.address}` : ""}`,
    ...(order.directionsUrl ? [`Cómo llegar: ${order.directionsUrl}`] : []),
    "",
    `A nombre de: ${order.buyerName}`,
    ...order.tickets.map((t, i) => `Entrada ${i + 1}: ${t.ticketType} — código ${t.code}`),
    "",
    order.complimentary ? "Invitación sin costo." : `Total pagado: ${formatPrice(order.totalCents)}`,
    "Mostrá el QR de cada entrada en la puerta. No reenvíes este mail: quien tenga los códigos puede usar las entradas.",
  ].join("\n");
  return { subject: `${order.complimentary ? "Tu invitación" : "Tus entradas"} para ${order.event.name}`, html, text };
}

export function emailVerification({ name, url }: { name: string; url: string }) {
  const html = layout({
    preheader: "Confirmá tu email para empezar a vender",
    body: `
      ${h1("Confirmá tu email")}
      ${p(`Hola ${esc(name)}, gracias por crear tu cuenta de organizador en ecko. Confirmá tu email para poder publicar eventos y cobrar.`)}
      ${button(url, "Confirmar mi email")}
      ${muted("El link vale por 48 horas. Si no creaste una cuenta en ecko, ignorá este mail.")}`,
  });
  return {
    subject: "Confirmá tu email de ecko",
    html,
    text: `Hola ${name}, confirmá tu email entrando a: ${url}\nEl link vale por 48 horas.`,
  };
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

export function paymentRefunded({ buyerName, eventName, totalCents, eventUrl }: { buyerName: string; eventName: string; totalCents: number; eventUrl: string }) {
  const html = layout({
    preheader: `Te devolvimos el pago de ${eventName}`,
    body: `
      ${h1("Te devolvimos el pago")}
      ${p(`Hola ${esc(buyerName)}, tu pago de <b>${esc(formatPrice(totalCents))}</b> para <b>${esc(eventName)}</b> se aprobó después de que venciera la reserva, y para entonces las entradas ya no estaban disponibles.`)}
      ${p("Te devolvimos el total por Mercado Pago. Según el medio de pago, puede tardar unos días en verse en tu cuenta o tu tarjeta.")}
      ${button(eventUrl, "Ver el evento")}`,
  });
  return {
    subject: `Te devolvimos el pago de ${eventName}`,
    html,
    text: `Hola ${buyerName}, tu pago de ${formatPrice(totalCents)} para ${eventName} llegó cuando la reserva ya había vencido y no quedaban entradas. Te devolvimos el total por Mercado Pago.\n${eventUrl}`,
  };
}

// Botón de arrepentimiento: constancia para el comprador, con el código de trámite.
export function revocationReceived({ name, code, eventName }: { name: string; code: string; eventName: string | null }) {
  const html = layout({
    preheader: `Recibimos tu pedido de arrepentimiento. Código ${code}`,
    body: `
      ${h1("Recibimos tu pedido")}
      ${p(`Hola ${esc(name)}, recibimos tu pedido de revocación (botón de arrepentimiento)${eventName ? ` de la compra para <b>${esc(eventName)}</b>` : ""}.`)}
      ${p(`Tu código de trámite es <b style="font-family:'Courier New',monospace;font-size:18px">${esc(code)}</b>. Guardalo para cualquier consulta.`)}
      ${muted("Vamos a revisar el pedido y te vamos a escribir a este mail con la respuesta.")}`,
  });
  return {
    subject: `Pedido de arrepentimiento recibido · ${code}`,
    html,
    text: `Hola ${name}, recibimos tu pedido de revocación${eventName ? ` de la compra para ${eventName}` : ""}. Tu código de trámite es ${code}. Te vamos a responder a este mail.`,
  };
}

export function revocationForAdmins(r: { code: string; name: string; email: string; reference: string | null; reason: string | null; eventName: string | null; url: string }) {
  const html = layout({
    preheader: `Nuevo pedido de arrepentimiento ${r.code}`,
    body: `
      ${h1("Nuevo pedido de arrepentimiento")}
      ${p(`<b>Código:</b> ${esc(r.code)}<br><b>Nombre:</b> ${esc(r.name)}<br><b>Email:</b> ${esc(r.email)}<br><b>Compra:</b> ${r.eventName ? esc(r.eventName) : "no identificada"}${r.reference ? `<br><b>Referencia:</b> ${esc(r.reference)}` : ""}${r.reason ? `<br><b>Motivo:</b> ${esc(r.reason)}` : ""}`)}
      ${button(r.url, "Ver en Administración")}`,
  });
  return {
    subject: `Arrepentimiento ${r.code}${r.eventName ? ` · ${r.eventName}` : ""}`,
    html,
    text: `Nuevo pedido de arrepentimiento ${r.code} de ${r.name} <${r.email}>. Ver: ${r.url}`,
  };
}

// La compra se anuló porque el organizador devolvió el pago desde Mercado Pago.
export function orderRefunded({ buyerName, eventName, totalCents }: { buyerName: string; eventName: string; totalCents: number }) {
  const html = layout({
    preheader: `Te devolvimos el dinero de tu compra para ${eventName}`,
    body: `
      ${h1("Te devolvimos el dinero")}
      ${p(`Hola ${esc(buyerName)}, se te devolvió el pago de <b>${esc(formatPrice(totalCents))}</b> de tu compra para <b>${esc(eventName)}</b>, y las entradas de esa compra quedaron anuladas.`)}
      ${muted("La devolución se hace por Mercado Pago, al mismo medio con el que pagaste. Según el medio, puede tardar unos días en verse en tu cuenta o en el resumen de tu tarjeta.")}`,
  });
  return {
    subject: `Te devolvimos el dinero de ${eventName}`,
    html,
    text: `Hola ${buyerName}, se te devolvió el pago de ${formatPrice(totalCents)} de tu compra para ${eventName}. Las entradas de esa compra quedaron anuladas.`,
  };
}
