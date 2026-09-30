# Ticketera

Plataforma para vender entradas a eventos: cartelera, compra con QR, panel para organizadores, administración y app de puerta para validar entradas.

Stack: Node.js 22 + TypeScript, Express 5, Prisma 7 (SQLite en desarrollo), Zod y Vitest. El frontend son páginas HTML simples en `public/`, sin paso de compilación.

## Primeros pasos

```bash
cp .env.example .env
npm install            # también genera el cliente de Prisma
npm run db:migrate     # crea o actualiza la base SQLite local (dev.db)
npm run db:seed        # administrador y eventos de ejemplo (opcional, solo desarrollo)
npm run dev            # http://localhost:3000
npm test
```

`npm run db:seed` crea un administrador de prueba: **organizador@ticketera.test** / **ticketera123**.

Para convertir una cuenta existente en administrador: `npm run make-admin -- email@ejemplo.com`.

## Páginas

- **Cartelera** (`/`): eventos a la venta.
- **Evento** (`/evento.html?id=...`): tipos de entrada y formulario de compra.
- **Tu compra** (`/orden.html#<orden>.<clave>`): estado de la orden, pago y, una vez paga, las entradas con su QR. El link se puede guardar para volver a verlas.
- **Panel del organizador** (`/panel.html`): eventos con ventas y recaudación, tipos de entrada, publicación, link de puerta y últimas órdenes.
- **Administración** (`/admin.html`): aprobar organizadores o quitarles la aprobación.
- **App de puerta** (`/puerta.html#<clave>`): escanea el QR con la cámara (o se carga el código a mano) y muestra si la entrada es válida, ya fue usada, no está paga o es de otro evento.

> La cámara del navegador solo funciona en páginas `https` o en `localhost`. Desde otro dispositivo en tu red local se puede cargar el código a mano.

## Cómo funciona

**Organizadores.** Cualquiera puede crear una cuenta, pero queda pendiente: puede preparar eventos y no publicarlos hasta que un administrador la apruebe. Si se le quita la aprobación, sus eventos salen de la cartelera y dejan de venderse.

**Compras.** Al comprar se crea una orden pendiente que reserva las entradas por 15 minutos (`ORDER_TTL_MINUTES`). Si no se paga a tiempo, vence y el cupo se libera. Las entradas gratis se confirman al instante. Cada orden tiene una clave secreta: sin ella nadie puede ver la orden, y los códigos de las entradas se entregan recién cuando está paga.

**Pago.** Por ahora el pago es simulado (`SIMULATED_PAYMENTS`): viene activado en desarrollo y **apagado en producción**. Se reemplazará por Mercado Pago.

**Puerta.** El organizador genera un link de puerta por evento con una clave secreta. Quien lo tenga puede validar entradas de ese evento (y de ningún otro), sin crear cuenta. Si se filtra, se regenera y el anterior deja de funcionar.

**Códigos de entrada.** Formato `K7QM-4XTP-9HWD` (Base32 de Crockford, sin I, L, O ni U) para que se puedan dictar. Al cargarlos a mano no importan mayúsculas, espacios ni guiones, y se corrige O→0 e I/L→1. Las entradas con el formato anterior siguen siendo válidas.

## Reglas y protecciones

- Solo se venden entradas de eventos publicados, futuros y de organizadores aprobados.
- No hay sobreventa: el cupo se reserva con una actualización atómica, también con compras simultáneas.
- Hasta 10 entradas por compra, todas del mismo evento.
- Una entrada se valida solo si está paga, una sola vez, y con el link de puerta de su evento.
- Cada organizador ve y modifica solo sus eventos. La recaudación suma el precio de cada entrada al momento de la compra, solo de órdenes pagas.
- Contraseñas con scrypt; sesiones en cookie `HttpOnly` + `SameSite=Lax` (y `Secure` en producción).
- Límites de pedidos: login (por IP y por cuenta), registro, compras, validaciones de puerta y un tope general por IP.
- Cabeceras de seguridad con Helmet y una política de contenido que solo permite scripts del propio sitio.
- Todo el texto que cargan los usuarios se escapa antes de mostrarse.
- Las respuestas de la API no se guardan en caché (`Cache-Control: no-store`).

## Configuración (`.env`)

| Variable              | Default                        | Para qué                                                      |
|-----------------------|--------------------------------|---------------------------------------------------------------|
| `DATABASE_URL`        | `file:./dev.db`                | Base de datos                                                 |
| `PORT`                | `3000`                         | Puerto del servidor                                           |
| `NODE_ENV`            | —                              | `production` activa cookies `Secure`, HSTS y apaga el pago simulado |
| `ORDER_TTL_MINUTES`   | `15`                           | Minutos para pagar antes de que la orden venza                |
| `SIMULATED_PAYMENTS`  | `true` en desarrollo, `false` en producción | Permite confirmar compras sin cobrar             |
| `TRUST_PROXY`         | `0`                            | Cantidad de proxies delante del servidor (para leer la IP real) |

## Modelo de datos

| Entidad      | Qué representa                                                                 |
|--------------|--------------------------------------------------------------------------------|
| `User`       | Organizador o administrador (`role`), con fecha de aprobación (`approvedAt`).   |
| `Session`    | Una sesión iniciada; vence a los 7 días.                                        |
| `Event`      | Un evento de un organizador. Estados: `DRAFT`, `PUBLISHED`, `CANCELLED`.        |
| `TicketType` | Un tipo de entrada (Campo, Platea…) con precio, cupo y cantidad reservada.      |
| `Order`      | Una compra de un evento, con su clave de acceso. Estados: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`. |
| `Ticket`     | Una entrada individual con su código único y el precio pagado.                  |

Los precios se guardan en centavos para evitar errores de redondeo.

## Endpoints

Públicos:

| Método | Ruta                              | Descripción                                             |
|--------|-----------------------------------|---------------------------------------------------------|
| GET    | `/health`                         | Chequeo de estado                                       |
| GET    | `/events`                         | Eventos a la venta                                      |
| GET    | `/events/:id`                     | Detalle de un evento a la venta                         |
| POST   | `/orders`                         | Comprar entradas (devuelve el id y la clave de la orden) |
| GET    | `/orders/:id`                     | Ver la orden (header `x-order-token`)                   |
| POST   | `/orders/:id/simulate-payment`    | Pago simulado (header `x-order-token`; solo si está activado) |
| GET    | `/tickets/:code/qr.svg`           | Imagen QR de una entrada paga                           |

Cuentas:

| Método | Ruta              | Descripción                  |
|--------|-------------------|------------------------------|
| POST   | `/auth/register`  | Crear cuenta de organizador  |
| POST   | `/auth/login`     | Iniciar sesión               |
| POST   | `/auth/logout`    | Cerrar sesión                |
| GET    | `/auth/me`        | Usuario logueado             |

Organizador (requieren sesión y solo acceden a eventos propios):

| Método | Ruta                                   | Descripción                                             |
|--------|----------------------------------------|---------------------------------------------------------|
| GET    | `/organizer/events`                    | Mis eventos con ventas y recaudación                    |
| POST   | `/organizer/events`                    | Crear evento (queda en borrador)                        |
| GET    | `/organizer/events/:id`                | Detalle con estadísticas y últimas órdenes              |
| POST   | `/organizer/events/:id/ticket-types`   | Agregar un tipo de entrada                              |
| POST   | `/organizer/events/:id/publish`        | Publicar (requiere cuenta aprobada y al menos un tipo de entrada) |
| POST   | `/organizer/events/:id/door-token`     | Generar o regenerar el link de puerta                   |

Administración (requieren sesión de administrador):

| Método | Ruta                               | Descripción                          |
|--------|------------------------------------|--------------------------------------|
| GET    | `/admin/organizers`                | Organizadores y su estado            |
| POST   | `/admin/organizers/:id/approve`    | Aprobar un organizador               |
| POST   | `/admin/organizers/:id/revoke`     | Quitarle la aprobación               |

App de puerta (requieren el header `x-door-token` con la clave del link de puerta):

| Método | Ruta              | Descripción                                 |
|--------|-------------------|---------------------------------------------|
| GET    | `/door/event`     | Evento de ese link y contador de ingresos   |
| POST   | `/door/check-in`  | Validar una entrada: `{ "code": "..." }`    |

## Pendiente antes de producción

1. **Pagos reales** con Mercado Pago (Checkout Pro + webhook). Contemplar un pago que llega después de que la orden venció.
2. **Publicar online** con https y PostgreSQL (cambiar `provider` y el adapter de Prisma). Detrás de un proxy, configurar `TRUST_PROXY`.
3. **Entrega de entradas por email**, con el link de la compra.
4. **Límites de pedidos compartidos** (por ejemplo con Redis) si se corre más de una instancia del servidor.
5. `npm audit` marca alertas en la herramienta de línea de comandos de Prisma (soporte MySQL y lectura de su configuración). No afectan a la ticketera: revisar al actualizar Prisma.
6. **Más gestión de eventos**: editar, cancelar con reintegros, imagen, cierre de venta.
