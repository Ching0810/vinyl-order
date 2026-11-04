/*
  Warnings:

  - You are about to drop the column `discogsReleaseId` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `genres` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `isHot` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `slideOrder` on the `Product` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Product_discogsReleaseId_key";

-- DropIndex
DROP INDEX "Product_slideOrder_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "discogsReleaseId",
DROP COLUMN "genres",
DROP COLUMN "isHot",
DROP COLUMN "slideOrder";
