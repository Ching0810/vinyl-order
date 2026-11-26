/*
  Warnings:

  - A unique constraint covering the columns `[cartId,offerId]` on the table `CartItem` will be added. If there are existing duplicate values, this will fail.
  - Made the column `offerId` on table `CartItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "CartItem_cartId_productId_key";

-- A cart line is an offer now (tracker.md §8). Lines from before, with no
-- offer, priced by the record's own demo price, can't be bought any more:
-- dropped, as a line for an offer that's gone is. Hand-written; Prisma only
-- warns. Neon had none (2026-11-26); a local database may.
DELETE FROM "CartItem" WHERE "offerId" IS NULL;

-- AlterTable
ALTER TABLE "CartItem" ALTER COLUMN "offerId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_offerId_key" ON "CartItem"("cartId", "offerId");
