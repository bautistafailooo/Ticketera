# Cobrar con Mercado Pago

## Cómo funciona

- Cada **organizador conecta su cuenta de Mercado Pago** desde su panel (botón **Conectar Mercado Pago**).
- El comprador paga en Mercado Pago (tarjeta de crédito, débito o dinero en cuenta). La plata de las entradas va **directo a la cuenta del organizador**.
- El **cargo por servicio** (10% por defecto, lo paga el comprador) Mercado Pago lo separa solo y lo manda a **la cuenta de ecko** (la tuya).
- ecko nunca toca la plata de los organizadores ni tiene que hacer transferencias.

Ejemplo con 2 entradas de $10.000:

| | |
|---|---|
| El comprador paga | $20.000 + $2.000 de cargo por servicio = **$22.000** |
| A ecko le llegan | **$2.000** |
| Al organizador le llegan | $20.000 menos la comisión de Mercado Pago por cobrar (depende de en cuántos días quiera recibir la plata) |

Otras reglas:
- Solo se aceptan pagos que se aprueban en el momento (no efectivo en Rapipago/Pago Fácil, que tarda días y la reserva dura 15 minutos).
- Si un pago se aprueba después de que venció la reserva: si todavía hay lugar, la compra se confirma igual. Si no, **se devuelve el pago solo** y se le avisa al comprador por mail.
- Si alguien paga dos veces la misma compra, el segundo pago se devuelve solo.
- **Devoluciones puntuales:** el organizador devuelve el pago desde su Mercado Pago (Actividad → el pago → Devolver dinero). Mercado Pago le avisa a ecko, que anula esa compra: las entradas dejan de valer en la puerta, el lugar vuelve a estar a la venta y el comprador recibe un mail. La comisión de ecko se devuelve sola. Lo mismo pasa con un contracargo.
- Sin cuenta conectada, un organizador no puede publicar eventos con entradas pagas (los gratis sí).
- El porcentaje se cambia con `SERVICE_FEE_PERCENT` en el `.env` (afecta solo a las compras nuevas).

## 1. Preparar las cuentas de prueba

Para probar sin plata de verdad, Mercado Pago tiene **cuentas de prueba**: usuarios falsos con plata falsa. Las cuentas de prueba solo pueden operar con otras cuentas de prueba, así que para probar **todo** es de prueba: la cuenta de ecko, la del organizador y la del comprador.

1. Con tu cuenta de Mercado Pago entrá a [mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app) y creá una aplicación cualquiera (por ejemplo `ecko-pruebas`). Hace falta para poder crear cuentas de prueba.
2. En esa aplicación → **Cuentas de prueba** → **Crear cuenta de prueba**, tres veces:
   - **ecko**: tipo *Vendedor* (hace de tu cuenta, la que recibe el cargo por servicio),
   - **organizador**: tipo *Vendedor*,
   - **comprador**: tipo *Comprador*, con algo de saldo.

   Anotá usuario y contraseña de cada una. Si al iniciar sesión con una cuenta de prueba te pide un código por mail, poné los **últimos 6 dígitos del User ID** de esa cuenta (aparece en la lista).

## 2. Crear la aplicación de ecko

1. Cerrá sesión en Mercado Pago e iniciá sesión con la cuenta de prueba **ecko**. Entrá a [mercadopago.com.ar/developers/panel/app](https://www.mercadopago.com.ar/developers/panel/app) → **Crear aplicación**.
2. Nombre: `ecko`. Tipo de pago: **Pagos online**. ¿Usás una plataforma de e-commerce?: **No**. Producto: **Checkout Pro**. Creala.
3. En la aplicación, andá a **Credenciales de producción** y copiá el **Client ID** y el **Client Secret**. (Como la cuenta es de prueba, son credenciales de prueba aunque digan "producción".)
4. En tu archivo `.env` agregá:
   ```
   MP_CLIENT_ID=el-client-id
   MP_CLIENT_SECRET=el-client-secret
   ```
   El Client Secret es secreto: no lo compartas ni lo subas a GitHub. Si alguna vez lo cambiás, los organizadores tienen que volver a conectar su cuenta.
5. Arrancá ecko (`npm run tunel`). Al arrancar muestra una línea así:
   ```
   URL de redireccionamiento para tu aplicación de Mercado Pago: https://algo.trycloudflare.com/organizer/mercadopago/callback
   ```
6. En la aplicación de Mercado Pago: **Editar aplicación** (o *Configuración*) → **URLs de redireccionamiento** → pegá esa URL y guardá.

> **Con el túnel gratis** la dirección cambia cada vez que corrés `npm run tunel`. La URL de redireccionamiento solo se usa **al conectar** una cuenta, así que solo hay que actualizarla en Mercado Pago cuando un organizador va a conectar la suya. Los pagos funcionan aunque la dirección cambie. Con dominio propio se configura una sola vez.

## 3. Probar una compra

1. **Conectar el organizador:** en una ventana de incógnito, entrá a ecko, iniciá sesión como organizador, tocá **Conectar Mercado Pago** e ingresá con la cuenta de prueba **organizador**. Al volver, el panel dice *Conectado*.
2. Publicá un evento con entradas pagas.
3. **Comprar:** en otra ventana de incógnito (o en el celular), comprá entradas y tocá **Pagar con Mercado Pago**. Ingresá con la cuenta de prueba **comprador** y pagá con una tarjeta de prueba:

   | Tarjeta | Número | Código | Vencimiento |
   |---|---|---|---|
   | Mastercard | 5031 7557 3453 0604 | 123 | 11/30 |
   | Visa | 4509 9535 6623 3704 | 123 | 11/30 |

   En **nombre del titular** escribí `APRO` para que se apruebe, u `OTHE` para que se rechace. DNI: `12345678`.
4. Al volver a ecko, la compra queda confirmada y llega el mail con las entradas. En la cuenta de prueba **ecko** vas a ver el cargo por servicio, y en la de **organizador**, el resto.

Mientras pruebes en tu compu, el botón **Pago de prueba (sin cobrar)** sigue apareciendo abajo del de Mercado Pago. Para sacarlo, agregá `SIMULATED_PAYMENTS=false` al `.env`. En el servidor ya está apagado.

## 4. Para el lanzamiento

- Creá la aplicación `ecko` de nuevo, esta vez con **tu cuenta real** de Mercado Pago (la que va a recibir el cargo por servicio), y usá sus credenciales de producción.
- En el servidor (`.env.production`): `MP_CLIENT_ID`, `MP_CLIENT_SECRET` y sacar `SIMULATED_PAYMENTS`.
- En la aplicación de Mercado Pago, la URL de redireccionamiento con tu dominio: `https://tudominio.com.ar/organizer/mercadopago/callback`.
- Cada organizador real conecta **su** cuenta real.
- **Consultá con un contador** cómo facturar el cargo por servicio que cobra ecko.
