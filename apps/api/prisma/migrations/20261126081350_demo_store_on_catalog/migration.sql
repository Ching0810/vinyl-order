-- The demo store sells listings in the shops' copied catalogs, not offers
-- (tracker.md §8). Hand-ordered from Prisma's draft: its draft dropped the
-- cart's offerId before adding catalogEntryId NOT NULL, which loses every
-- line and fails on any. Here each line moves to its offer's listing first.

-- AlterTable: the demo checkout's holds, kept apart from the shop's count.
ALTER TABLE "CatalogEntry" ADD COLUMN     "reservedQty" INTEGER NOT NULL DEFAULT 0;

-- Prisma's schema cannot express a CHECK, so it lives here, like Offer's.
ALTER TABLE "CatalogEntry" ADD CONSTRAINT "CatalogEntry_reservedQty_non_negative" CHECK ("reservedQty" >= 0);

-- AlterTable: nullable while the lines are moved.
ALTER TABLE "CartItem" ADD COLUMN     "catalogEntryId" TEXT;

-- A cart line buys its offer's listing: the same (supplier, externalId).
-- Both are unique per shop, so two lines of a cart can't land on one entry.
UPDATE "CartItem" AS item
SET "catalogEntryId" = entry."id"
FROM "Offer" AS offer
JOIN "CatalogEntry" AS entry
  ON entry."supplier" = offer."supplier" AND entry."externalId" = offer."externalId"
WHERE offer."id" = item."offerId";

-- A line whose listing the catalog no longer has can't be bought.
DELETE FROM "CartItem" WHERE "catalogEntryId" IS NULL;

ALTER TABLE "CartItem" ALTER COLUMN "catalogEntryId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_offerId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";

-- DropIndex
DROP INDEX "CartItem_cartId_offerId_key";

-- DropIndex
DROP INDEX "CartItem_offerId_idx";

-- AlterTable
ALTER TABLE "CartItem" DROP COLUMN "offerId",
DROP COLUMN "productId";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "catalogEntryId" TEXT;

-- CreateIndex
CREATE INDEX "CartItem_catalogEntryId_idx" ON "CartItem"("catalogEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_catalogEntryId_key" ON "CartItem"("cartId", "catalogEntryId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_catalogEntryId_fkey" FOREIGN KEY ("catalogEntryId") REFERENCES "CatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
