import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { config } from "../config.js";
import { esc } from "./templates.js";

export type MailAttachment = { filename: string; content: Buffer; cid: string; contentType: string };
export type Mail = { to: string; subject: string; html: string; text: string; attachments?: MailAttachment[] };

// Mails enviados en modo "memory", para revisarlos en los tests.
export const sentMails: Mail[] = [];

const smtp = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

if (!smtp && config.isProduction && config.mailTransport !== "memory") {
  console.warn("SMTP_URL no está configurado: los mails no se van a enviar, solo se guardan en", config.mailOutboxDir);
}

// En desarrollo, guarda el mail como .html (con los QR incrustados) para abrirlo en el navegador.
async function saveToOutbox(mail: Mail) {
  await mkdir(config.mailOutboxDir, { recursive: true });
  let html = mail.html;
  for (const a of mail.attachments ?? []) {
    html = html.replaceAll(`cid:${a.cid}`, `data:${a.contentType};base64,${a.content.toString("base64")}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = mail.subject.normalize("NFD").replace(/[^\w]+/g, "-").slice(0, 40).toLowerCase();
  const file = path.join(config.mailOutboxDir, `${stamp}-${slug}.html`);
  const header = `<div style="font:14px sans-serif;background:#ffe;padding:12px;border-bottom:1px solid #ccc">
    <b>Para:</b> ${esc(mail.to)}<br><b>Asunto:</b> ${esc(mail.subject)}<br><i>Mail de prueba guardado localmente (no se envió).</i></div>`;
  await writeFile(file, header + html);
  console.log(`✉  Mail guardado (no enviado): ${file}`);
}

export async function sendMail(input: Mail) {
  // El asunto incluye texto de usuarios (nombres de eventos): sin saltos de línea.
  const mail = { ...input, subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 200) };
  if (config.mailTransport === "memory") {
    sentMails.push(mail);
    return;
  }
  if (smtp) {
    await smtp.sendMail({ from: config.mailFrom, ...mail });
    return;
  }
  await saveToOutbox(mail);
}

// Envía sin frenar la respuesta al usuario: si el mail falla, queda en el log.
export function sendInBackground(label: string, task: () => Promise<unknown>) {
  task().catch((err) => console.error(`No se pudo enviar el mail (${label}):`, err));
}
