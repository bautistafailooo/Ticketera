# Subir ecko a internet (Hostinger VPS)

Guía para tener ecko online **en privado** en un servidor propio: con https, una contraseña para entrar mientras se prueba, copias de seguridad diarias y actualizaciones con un solo comando.

Cómo queda armado: ecko corre en Docker detrás de [Caddy](https://caddyserver.com), que consigue y renueva solo el certificado https. La base de datos, los flyers y las copias quedan en `/opt/ecko/data`.

## 1. Contratar el VPS

1. En Hostinger elegí **VPS → KVM 1** (1 procesador, 4 GB de RAM). Alcanza para empezar y se puede agrandar después.
2. Al configurarlo:
   - **Ubicación:** la más cercana a tus compradores (por ejemplo, Brasil).
   - **Sistema operativo:** **Ubuntu 24.04** "limpio", sin panel de control.
   - **Contraseña de root:** elegí una fuerte y guardala.
3. Cuando esté listo, anotá la **IP** del servidor (aparece en el panel del VPS).

## 2. Abrir la terminal del servidor

Dos opciones:
- **Desde el navegador:** en el panel del VPS de Hostinger, tocá **Terminal del navegador** (Browser terminal).
- **Desde tu compu:** en PowerShell, `ssh root@TU_IP` y escribí la contraseña de root.

## 3. Instalar ecko

Pegá este comando y apretá Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/bautistafailooo/Ticketera/refs/heads/claude/ticketera-primeros-pasos-lgk7de/deploy/instalar.sh | bash
```

El script actualiza el servidor, instala Docker, activa el firewall y las actualizaciones de seguridad automáticas, descarga ecko y te hace unas preguntas:

| Pregunta | Qué poner |
|---|---|
| Dominio del sitio | Si todavía no tenés dominio, **dejá el que aparece** (algo como `123-45-67-89.sslip.io`): es una dirección gratuita que apunta a tu servidor y tiene https. |
| Tu email | El email con el que te vas a registrar como administrador. |
| Contraseña para entrar al sitio | Te sugiere una. Es la que vas a compartir con quienes prueben ecko. |
| SMTP_URL | Enter para dejarlo para después (ver paso 5). |
| Remitente de los mails | Enter para dejar el que aparece. |

Tarda unos minutos. Al final te muestra la dirección y la contraseña del sitio.

## 4. Tu cuenta de administrador

1. Abrí la dirección en el navegador. Cuando pida **usuario y contraseña**, el usuario puede ser cualquier cosa; la contraseña es la del sitio.
2. Andá a **Organizadores → Crear cuenta** con el **mismo email** que pusiste en la instalación.
3. En la terminal del servidor corré:
   ```bash
   cd /opt/ecko && docker compose restart app
   ```
   Al reiniciar, tu cuenta pasa a ser administrador. Volvé a entrar y vas a ver **Administración**.

## 5. Mails de verdad (opcional por ahora)

Sin configurar esto, los mails no salen: quedan guardados en `/opt/ecko/data/mail-outbox`.

1. Creá una cuenta gratis en [Resend](https://resend.com) → **API Keys** → crear una.
2. En el servidor, editá la configuración:
   ```bash
   nano /opt/ecko/.env.production
   ```
   y completá (borrando la línea `SMTP_URL=` si quedó vacía):
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_USER=resend
   SMTP_PASS=TU_API_KEY
   MAIL_FROM=ecko <onboarding@resend.dev>
   ```
   Guardá con `Ctrl+O`, Enter, y salí con `Ctrl+X`.
3. Aplicá el cambio: `cd /opt/ecko && docker compose up -d`

Mientras no verifiques un dominio propio en Resend, **solo llegan los mails dirigidos a tu propio email** (el de la cuenta de Resend). Alcanza para probar. También podés usar Gmail, y para verificar el dominio seguí [MAILS.md](MAILS.md). Para probar el envío: `docker compose exec app npm run probar-mail -- tu@email.com`.

## 6. Qué probar

- Crear un evento con flyer, publicarlo y verlo en la cartelera.
- Comprar entradas desde el celular y recibir el mail.
- Generar el link de puerta y **escanear el QR con la cámara del celular** (funciona porque hay https).
- "Olvidé mi contraseña".

## Actualizar ecko

Cada vez que haya cambios nuevos en GitHub:

```bash
bash /opt/ecko/deploy/actualizar.sh
```

Baja la última versión y reinicia. La base, los flyers y la configuración se conservan. Las migraciones de la base se aplican solas al arrancar.

## Cuando tengas dominio propio

1. En el lugar donde compraste el dominio, creá un registro **A** que apunte a la IP del servidor (para `ecko.com.ar` y, si querés, otro para `www`).
2. En el servidor:
   ```bash
   cd /opt/ecko
   nano .env               # cambiá DOMAIN=tudominio.com.ar
   nano .env.production    # cambiá PUBLIC_URL=https://tudominio.com.ar
   docker compose up -d
   ```
   Caddy consigue el certificado https del dominio nuevo solo.

## Comandos útiles

| Para | Comando (dentro de `/opt/ecko`) |
|---|---|
| Ver si está andando | `docker compose ps` |
| Ver los últimos mensajes | `docker compose logs --tail 50 app` |
| Reiniciar | `docker compose restart app` |
| Cambiar la configuración | `nano .env.production` y después `docker compose up -d` |

## Copias de seguridad

- ecko hace una copia de la base por día en `/opt/ecko/data/backups` y guarda las últimas 7.
- Como están en el mismo servidor, activá también las **copias automáticas del VPS** en el panel de Hostinger (Backups / Snapshots), para tener copias fuera del servidor.

## Antes del lanzamiento

En `/opt/ecko/.env.production`:
- Sacar `SITE_PASSWORD` (el sitio pasa a ser público).
- Sacar `SIMULATED_PAYMENTS` (se apaga el pago simulado), cuando esté Mercado Pago.
- Tener el dominio propio y los mails con el dominio verificado.
