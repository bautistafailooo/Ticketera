import { config } from "./config.js";
import { describeSmtp, explainMailError } from "./mail/smtp.js";
import { sendMail } from "./mail/transport.js";

// Manda un mail de prueba para ver si el envío está bien configurado:
//   npm run probar-mail -- tu@email.com
const to = process.argv[2]?.trim();
if (!to || !to.includes("@")) {
  console.error("Uso: npm run probar-mail -- tu@email.com");
  process.exit(1);
}

if (!config.smtp) {
  console.log("Todavía no configuraste el envío (falta SMTP_HOST en el archivo .env).");
  console.log("El mail de prueba se va a guardar en la carpeta mail-outbox/ en lugar de enviarse.\n");
} else {
  console.log(`Mandando un mail de prueba a ${to} por ${describeSmtp(config.smtp)} como ${config.mailFrom}…`);
}

try {
  await sendMail({
    to,
    subject: "Prueba de mails de ecko",
    text: "Si te llegó este mail, el envío de ecko está funcionando.",
    html: `<p style="font-family:sans-serif">Si te llegó este mail, el envío de <b>ecko</b> está funcionando. 🎉</p>`,
  });
  if (config.smtp) {
    console.log("\n¡Enviado! Fijate en tu bandeja de entrada (y en Spam, por las dudas).");
  }
} catch (err) {
  console.error(`\nNo se pudo mandar: ${explainMailError(err)}`);
  process.exit(1);
}
