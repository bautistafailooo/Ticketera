import { readFile } from "node:fs/promises";
import path from "node:path";
import QRCode from "qrcode";
import { config } from "./config.js";
import { describeSmtp, explainMailError } from "./mail/smtp.js";
import { orderConfirmed } from "./mail/templates.js";
import { sendMail, type Mail } from "./mail/transport.js";

// Manda un mail de prueba para ver si el envío está bien configurado:
//   npm run probar-mail -- tu@email.com
// Con --entradas manda un ejemplo del mail que recibe el comprador (con entradas de mentira):
//   npm run probar-mail -- tu@email.com --entradas
const to = process.argv.slice(2).find((a) => a.includes("@"))?.trim();
const sample = process.argv.includes("--entradas");
if (!to) {
  console.error("Uso: npm run probar-mail -- tu@email.com [--entradas]");
  process.exit(1);
}

async function sampleTicketsMail(): Promise<Mail> {
  const codes = ["DEMO-ECKO-0001", "DEMO-ECKO-0002"];
  const tickets = codes.map((code, i) => ({ ticketType: i === 0 ? "Campo" : "Platea", code, cid: `qr-${i}@ecko` }));
  const attachments = await Promise.all(
    tickets.map(async (t, i) => ({
      filename: `entrada-${i + 1}.png`,
      cid: t.cid,
      contentType: "image/png",
      content: await QRCode.toBuffer(t.code, { type: "png", width: 360, margin: 1 }),
    })),
  );
  attachments.push({
    filename: "flyer.jpg",
    cid: "flyer@ecko",
    contentType: "image/jpeg",
    content: await readFile(path.join(import.meta.dirname, "../demo/imagenes/rock.jpg")),
  });
  const message = orderConfirmed({
    buyerName: "Bautista",
    complimentary: false,
    totalCents: 9900000,
    feeCents: 900000,
    event: {
      name: "Noche de Rock Nacional (ejemplo)",
      venue: "Estadio Obras",
      address: "Av. del Libertador 7395, CABA",
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=Estadio%20Obras",
    flyerCid: "flyer@ecko",
    revocationUrl: `${config.publicUrl}/arrepentimiento.html`,
    tickets,
  });
  return { to: to!, ...message, subject: `[Ejemplo] ${message.subject}`, attachments };
}

if (!config.smtp) {
  console.log("Todavía no configuraste el envío (falta SMTP_HOST en el archivo .env).");
  console.log("El mail de prueba se va a guardar en la carpeta mail-outbox/ en lugar de enviarse.\n");
} else {
  console.log(`Mandando ${sample ? "un ejemplo del mail de entradas" : "un mail de prueba"} a ${to} por ${describeSmtp(config.smtp)} como ${config.mailFrom}…`);
}

try {
  await sendMail(
    sample
      ? await sampleTicketsMail()
      : {
          to,
          subject: "Prueba de mails de ecko",
          text: "Si te llegó este mail, el envío de ecko está funcionando.",
          html: `<p style="font-family:sans-serif">Si te llegó este mail, el envío de <b>ecko</b> está funcionando. 🎉</p>`,
        },
  );
  if (config.smtp) {
    console.log("\n¡Enviado! Fijate en tu bandeja de entrada (y en Spam, por las dudas).");
  }
} catch (err) {
  console.error(`\nNo se pudo mandar: ${explainMailError(err)}`);
  process.exit(1);
}
