# Ticketera

API para vender entradas a eventos: eventos, tipos de entrada, órdenes de compra y validación de entradas en la puerta.

Stack: Node.js 22 + TypeScript, Express 5, Prisma 7 (SQLite en desarrollo), Zod y Vitest.

## Primeros pasos

```bash
cp .env.example .env
npm install            # también genera el cliente de Prisma
npm run db:migrate     # crea la base SQLite local (dev.db)
npm run db:seed        # carga eventos de ejemplo (opcional)
npm run dev            # http://localhost:3000
npm test
```

## Página web

Con el servidor andando, abrí http://localhost:3000:

- **Cartelera** (`/`): los eventos publicados.
- **Evento** (`/evento.html?id=...`): tipos de entrada, formulario de compra y, al confirmar, las entradas con su QR.

Son páginas HTML simples en `public/`, sin paso de compilación. El pago todavía es simulado.

## Modelo de datos

| Entidad      | Qué representa                                                         |
|--------------|------------------------------------------------------------------------|
| `Event`      | Un evento (nombre, lugar, fecha). Estados: `DRAFT`, `PUBLISHED`, `CANCELLED`. |
| `TicketType` | Un tipo de entrada de un evento (Campo, Platea…) con precio y cupo.     |
| `Order`      | Una compra. Estados: `PENDING`, `PAID`, `CANCELLED`.                   |
| `Ticket`     | Una entrada individual, con un `code` único (lo que va en el QR).      |

Los precios se guardan en centavos (`priceCents`, `totalCents`) para evitar errores de redondeo.

## Endpoints

| Método | Ruta                          | Descripción                                    |
|--------|-------------------------------|------------------------------------------------|
| GET    | `/health`                     | Chequeo de estado                              |
| GET    | `/events`                     | Eventos publicados                             |
| POST   | `/events`                     | Crear evento (queda en borrador)               |
| GET    | `/events/:id`                 | Detalle de un evento con sus tipos de entrada  |
| POST   | `/events/:id/ticket-types`    | Agregar un tipo de entrada                     |
| POST   | `/events/:id/publish`         | Publicar (requiere al menos un tipo de entrada)|
| POST   | `/orders`                     | Comprar entradas                               |
| GET    | `/orders/:id`                 | Ver una orden con sus entradas                 |
| POST   | `/orders/:id/pay`             | Pago **simulado** (marca la orden como paga)   |
| GET    | `/tickets/:code/qr.svg`       | Imagen QR de una entrada                       |
| POST   | `/tickets/:code/check-in`     | Validar una entrada en la puerta               |

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

## Próximos pasos sugeridos

1. **Autenticación y roles**: organizadores (crean eventos), compradores y personal de puerta. Hoy los endpoints de administración están abiertos.
2. **Pagos reales**: integrar Mercado Pago (Checkout Pro + webhook) en lugar de `/orders/:id/pay`.
3. **Vencimiento de órdenes pendientes**: liberar el cupo si no se pagan en X minutos.
4. **Entrega de entradas**: enviar por email las entradas con su QR.
5. **Panel del organizador y app de puerta**: crear eventos desde la web y escanear QR para validar.
6. **Base de datos de producción**: pasar a PostgreSQL (cambiar `provider` y el adapter de Prisma).
