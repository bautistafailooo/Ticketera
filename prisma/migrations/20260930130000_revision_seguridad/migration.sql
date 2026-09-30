-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalCents" INTEGER NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Órdenes existentes: se completa el evento a partir de sus entradas y se genera una clave de acceso.
INSERT INTO "new_Order" ("buyerEmail", "buyerName", "createdAt", "id", "status", "totalCents", "eventId", "accessToken")
SELECT "buyerEmail", "buyerName", "createdAt", "id", "status", "totalCents",
  (SELECT tt."eventId" FROM "Ticket" t JOIN "TicketType" tt ON tt."id" = t."ticketTypeId" WHERE t."orderId" = "Order"."id" LIMIT 1),
  lower(hex(randomblob(24)))
FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ticketTypeId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ticket_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES "TicketType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Entradas existentes: se guarda el precio actual de su tipo de entrada.
INSERT INTO "new_Ticket" ("code", "createdAt", "id", "orderId", "ticketTypeId", "usedAt", "priceCents")
SELECT "code", "createdAt", "id", "orderId", "ticketTypeId", "usedAt",
  (SELECT "priceCents" FROM "TicketType" WHERE "TicketType"."id" = "Ticket"."ticketTypeId")
FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_code_key" ON "Ticket"("code");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORGANIZER',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Cuentas existentes: quedan aprobadas, porque se crearon antes de que existiera la aprobación.
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "approvedAt")
SELECT "createdAt", "email", "id", "name", "passwordHash", "createdAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

