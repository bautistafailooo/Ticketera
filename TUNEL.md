# Probar ecko online desde tu compu (gratis)

Con un túnel de Cloudflare, ecko sigue corriendo en tu compu pero tiene una dirección pública con https, del estilo `https://algo-random.trycloudflare.com`. Sirve para probarlo desde el celular (incluida la cámara en la puerta) y para pasarle el link a otras personas.

Es gratis, sin tarjeta y sin crear cuenta. Solo funciona **mientras tu compu esté prendida y el comando esté corriendo**, y la dirección **cambia cada vez** que lo arrancás.

## Instalar (una sola vez)

En PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

Después **cerrá y volvé a abrir** la terminal (o VS Code) para que la reconozca. Para comprobarlo: `cloudflared --version`.

## Usar

En la terminal de VS Code, dentro de la carpeta del proyecto (en lugar de `npm run dev`):

```powershell
npm run tunel
```

A los pocos segundos aparece un recuadro con:

- **Dirección:** el link público, por ejemplo `https://ocean-dance-tiny-river.trycloudflare.com`.
- **Contraseña:** el sitio siempre queda protegido. Cuando el navegador pida **usuario y contraseña**, el usuario puede ser cualquier cosa; la contraseña es esa.

Pasale los dos datos a quien quieras que pruebe. Para cerrar todo: `Ctrl+C`.

Si preferís una contraseña fija en lugar de una al azar, agregá en tu archivo `.env`:

```
SITE_PASSWORD=la-que-quieras
```

## Importante

- **La base de datos es la de tu compu.** Lo que carguen los que prueban (eventos, compras, cuentas) queda en tu `dev.db`.
- **Tu base de prueba tiene una cuenta administrador con contraseña conocida** (`organizador@ticketera.test` / `ticketera123`). La contraseña del sitio impide que entre alguien de afuera, pero **no compartas esa cuenta**. Si vas a dejar entrar a otras personas, creá tu propia cuenta y hacela administrador con `npm run make-admin -- tu@email.com`.
- Los mails se guardan en la carpeta `mail-outbox/` hasta que configures el envío ([MAILS.md](MAILS.md)). Los links de los mails apuntan a la dirección del túnel.
- Mientras el túnel está abierto, no cierres la terminal ni suspendas la compu.
