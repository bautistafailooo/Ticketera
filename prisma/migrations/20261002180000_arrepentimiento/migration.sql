-- CreateTable
CREATE TABLE "RevocationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    CONSTRAINT "RevocationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevocationRequest_code_key" ON "RevocationRequest"("code");

-- CreateIndex
CREATE INDEX "RevocationRequest_resolvedAt_createdAt_idx" ON "RevocationRequest"("resolvedAt", "createdAt");

