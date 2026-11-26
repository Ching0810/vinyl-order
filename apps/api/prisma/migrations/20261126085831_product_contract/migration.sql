/*
  Warnings:

  - You are about to drop the column `reservedQty` on the `Offer` table. All the data in the column will be lost.
  - You are about to drop the column `offerId` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `artist` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `priceCents` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `year` on the `Product` table. All the data in the column will be lost.
  - Made the column `artistId` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_offerId_fkey";

-- AlterTable
ALTER TABLE "Offer" DROP COLUMN "reservedQty";

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "offerId";

-- Records from before the shops' catalogs (tracker.md step 1's Discogs era,
-- or made by hand) have no artist and no offer: nothing to compare or sell.
-- Hand-written, so artistId can be required; Neon had none (2026-11-26). Their
-- order lines keep their copies (SetNull); their category links go with them.
DELETE FROM "Product" WHERE "artistId" IS NULL;

-- AlterTable. The CHECKs on Product.stock, and on Offer.reservedQty above, go
-- with their columns: Postgres drops a constraint on a dropped column.
ALTER TABLE "Product" DROP COLUMN "artist",
DROP COLUMN "currency",
DROP COLUMN "priceCents",
DROP COLUMN "stock",
DROP COLUMN "year",
ALTER COLUMN "artistId" SET NOT NULL;
