# Ticketera

API para vender entradas a eventos: eventos, tipos de entrada, órdenes de compra y validación de entradas en la puerta.

Stack: Node.js 22 + TypeScript, Express 5, Prisma 7 (SQLite en desarrollo), Zod y Vitest.

## Primeros pasos

```bash
cp .env.example .env
npm install            # también genera el cliente de Prisma
npm run db:migrate     # crea la base SQLite local (dev.db)
npm run db:seed        # organizador y eventos de ejemplo (opcional)
npm run dev            # http://localhost:3000
npm test
```

## Página web

Con el servidor andando, abrí http://localhost:3000:

- **Cartelera** (`/`): los eventos publicados.
- **Evento** (`/evento.html?id=...`): tipos de entrada, formulario de compra y, al confirmar, las entradas con su QR.
- **Panel del organizador** (`/panel.html`): login y registro, lista de tus eventos con ventas y recaudación, creación de eventos, tipos de entrada, publicación y últimas órdenes.

`npm run db:seed` crea un organizador de prueba: **organizador@ticketera.test** / **ticketera123**. Si ya tenías eventos cargados sin organizador, se le asignan a esa cuenta.

Son páginas HTML simples en `public/`, sin paso de compilación. El pago todavía es simulado.

## Modelo de datos

| Entidad      | Qué representa                                                         |
|--------------|------------------------------------------------------------------------|
| `User`       | Un organizador (las contraseñas se guardan con scrypt).                |
| `Session`    | Una sesión iniciada; vence a los 7 días.                               |
| `Event`      | Un evento de un organizador. Estados: `DRAFT`, `PUBLISHED`, `CANCELLED`. |
| `TicketType` | Un tipo de entrada de un evento (Campo, Platea…) con precio y cupo.     |
| `Order`      | Una compra. Estados: `PENDING`, `PAID`, `CANCELLED`.                   |
| `Ticket`     | Una entrada individual, con un `code` único (lo que va en el QR).      |

Los precios se guardan en centavos (`priceCents`, `totalCents`) para evitar errores de redondeo.

## Endpoints

Públicos:

| Método | Ruta                          | Descripción                                    |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/health`                     | Chequeo de estado                              |
| GET    | `/events`                     | Eventos publicados                             |
| GET    | `/events/:id`                 | Detalle de un evento publicado                 |
| POST   | `/orders`                     | Comprar entradas                               |
| GET    | `/orders/:id`                 | Ver una orden con sus entradas                 |
| POST   | `/orders/:id/pay`             | Pago **simulado** (marca la orden como paga)   |
| GET    | `/tickets/:code/qr.svg`       | Imagen QR de una entrada                       |
| POST   | `/tickets/:code/check-in`     | Validar una entrada en la puerta               |

Cuentas (la sesión se guarda en una cookie `HttpOnly`):

| Método | Ruta              | Descripción                  |
|--------|-------------------|------------------------------|
| POST   | `/auth/register`  | Crear cuenta de organizador  |
| POST   | `/auth/login`     | Iniciar sesión               |
| POST   | `/auth/logout`    | Cerrar sesión                |
| GET    | `/auth/me`        | Organizador logueado         |

Organizador (requieren sesión y solo acceden a eventos propios):

| Método | Ruta                                   | Descripción                                        |
|--------|----------------------------------------|----------------------------------------------------|
| GET    | `/organizer/events`                    | Mis eventos con ventas y recaudación               |
| POST   | `/organizer/events`                    | Crear evento (queda en borrador)                   |
| GET    | `/organizer/events/:id`                | Detalle con estadísticas y últimas órdenes         |
| POST   | `/organizer/events/:id/ticket-types`   | Agregar un tipo de entrada                         |
| POST   | `/organizer/events/:id/publish`        | Publicar (requiere al menos un tipo de entrada)    |

Ejemplo de compra:

```bash
curl -X POST localhost:3000/orders -H 'content-type: application/json' -d '{
  "buyerName": "Ana",
  "buyerEmail": "ana@example.com",
  "items": [{ "ticketTypeId": "<id>", "quantity": 2 }]
}'
```

## Reglas de negocio ya cubiertas

- Solo se venden entradas de eventos publicados.
- No hay sobreventa: el cupo se reserva con una actualización atómica, también con compras simultáneas.
- Máximo 10 entradas por tipo en una misma compra.
- Una entrada solo se puede validar si la orden está paga, y una sola vez.
- Solo el organizador dueño de un evento puede verlo en el panel, modificarlo o publicarlo.
- La recaudación cuenta solo órdenes pagas.

## Próximos pasos sugeridos

1. **Pagos reales**: integrar Mercado Pago (Checkout Pro + webhook) en lugar de `/orders/:id/pay`.
2. **App de puerta**: escanear el QR con la cámara del celular y validar con `/tickets/:code/check-in` (hoy ese endpoint está abierto; debería requerir personal autorizado del evento).
3. **Vencimiento de órdenes pendientes**: liberar el cupo si no se pagan en X minutos.
4. **Entrega de entradas**: enviar por email las entradas con su QR.
5. **Más gestión de eventos**: editar, cancelar, subir imagen, cerrar la venta.
6. **Base de datos de producción**: pasar a PostgreSQL (cambiar `provider` y el adapter de Prisma).
