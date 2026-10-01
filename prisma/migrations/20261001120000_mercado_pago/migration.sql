-- AlterTable
ALTER TABLE "User" ADD COLUMN "mpAccessToken" TEXT;
ALTER TABLE "User" ADD COLUMN "mpConnectedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "mpRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "mpTokenExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "mpUserId" TEXT;

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
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "mpPaymentId" TEXT,
    "paidAt" DATETIME,
    "refundedAt" DATETIME,
    "expiresAt" DATETIME,
    "emailedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("accessToken", "buyerEmail", "buyerName", "createdAt", "emailedAt", "eventId", "expiresAt", "id", "status", "totalCents") SELECT "accessToken", "buyerEmail", "buyerName", "createdAt", "emailedAt", "eventId", "expiresAt", "id", "status", "totalCents" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");
CREATE UNIQUE INDEX "Order_mpPaymentId_key" ON "Order"("mpPaymentId");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
-- Las órdenes ya pagas: se toma la fecha de creación como fecha de pago.
UPDATE "Order" SET "paidAt" = "createdAt" WHERE "status" = 'PAID';
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

