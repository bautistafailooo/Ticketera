-- AlterTable
ALTER TABLE "Event" ADD COLUMN "doorToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_doorToken_key" ON "Event"("doorToken");

