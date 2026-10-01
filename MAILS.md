# Mandar los mails de verdad

ecko ya arma y manda todos los mails: entradas con QR, "olvidé mi contraseña", avisos al organizador y al administrador. Lo único que falta es decirle **por dónde** mandarlos. Mientras no lo configures, los mails se guardan en la carpeta `mail-outbox/` y no salen.

Hay dos opciones:

| | Gmail | Resend |
|---|---|---|
| Para | **Probar ahora**, sin dominio | **El lanzamiento**, con dominio propio |
| Costo | Gratis | Gratis hasta 3.000 mails por mes (100 por día) |
| ¿A quién le llegan? | A cualquiera | Sin dominio, **solo a vos**. Con dominio, a cualquiera |
| Remitente | Tu Gmail (`ecko <tu@gmail.com>`) | `ecko <entradas@tudominio.com>` |
| Límite | ~500 mails por día | Según el plan |

**Recomendación:** Gmail mientras probás con conocidos, y Resend con dominio propio cuando haya clientes reales (un mail de entradas desde un Gmail personal no da confianza y con mucho volumen Google lo frena).

## Opción 1: Gmail (para probar)

Conviene usar un Gmail nuevo solo para ecko (por ejemplo `ecko.entradas@gmail.com`), así no mezclás con tu mail personal.

1. **Activá la verificación en dos pasos** de esa cuenta: [myaccount.google.com/security](https://myaccount.google.com/security) → *Verificación en dos pasos*. Es obligatoria para el paso siguiente.
2. **Creá una contraseña de aplicación:** entrá a [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), poné de nombre `ecko` y tocá **Crear**. Te muestra una clave de 16 letras (`abcd efgh ijkl mnop`). Copiala: no se vuelve a mostrar.
3. **Agregá estas líneas al final de tu archivo `.env`** (en VS Code, en la carpeta de ecko):
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_USER=ecko.entradas@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop
   ```
   Con tu Gmail y tu clave. Los espacios de la clave no importan.
4. **Probalo** en la terminal:
   ```
   npm run probar-mail -- tu@email.com
   ```
   Si dice **¡Enviado!**, revisá la bandeja de entrada (y Spam). Si dice que rechazó el usuario o la clave, revisá que sea la contraseña de aplicación y no la de tu cuenta.
5. **Reiniciá ecko** (`Ctrl+C` y otra vez `npm run tunel` o `npm run dev`). Al arrancar tiene que decir:
   ```
   Mails: se envían por smtp.gmail.com:465 como ecko <ecko.entradas@gmail.com>.
   ```

Listo: las compras, "olvidé mi contraseña" y los avisos ya llegan de verdad. Con `npm run tunel`, los links de los mails apuntan a la dirección del túnel (cambia cada vez que lo abrís, así que los links de mails viejos dejan de andar).

## Opción 2: Resend con dominio propio (para el lanzamiento)

1. Comprá el dominio (por ejemplo `ecko.com.ar` en [nic.ar](https://nic.ar), o un `.com`).
2. Creá una cuenta en [resend.com](https://resend.com) → **Domains → Add domain** → poné tu dominio. Te da unos registros (TXT y MX) para agregar donde compraste el dominio. Cuando aparezca **Verified**, seguí.
3. **API Keys → Create API key** (permiso *Sending access*). Copiala (empieza con `re_`).
4. En el `.env` (o en `.env.production` en el servidor):
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_USER=resend
   SMTP_PASS=re_tu_api_key
   MAIL_FROM=ecko <entradas@tudominio.com>
   ```
   Si antes tenías Gmail, borrá esas líneas.
5. Probá con `npm run probar-mail -- tu@email.com` y reiniciá ecko.

Si querés probar Resend **antes** de tener dominio, usá `MAIL_FROM=ecko <onboarding@resend.dev>`: anda, pero solo te llegan a vos (el email de la cuenta de Resend).

## Si algo falla

- Al arrancar, ecko prueba la conexión y avisa si el usuario o la clave están mal.
- Si un mail no se pudo mandar, el motivo aparece en la terminal: `No se pudo enviar el mail (...)`.
- La compra no se frena si el mail falla: el comprador ve sus entradas en la página de la compra y puede tocar **Reenviar por mail**.
- **Nunca subas el `.env` a GitHub**: tiene la clave. Ya está en `.gitignore`.
