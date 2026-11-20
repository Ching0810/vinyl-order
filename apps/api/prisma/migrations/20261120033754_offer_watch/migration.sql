/*
  Warnings:

  - You are about to drop the `ProductWatch` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ProductWatch" DROP CONSTRAINT "ProductWatch_productId_fkey";

-- DropForeignKey
ALTER TABLE "ProductWatch" DROP CONSTRAINT "ProductWatch_userId_fkey";

-- DropTable
DROP TABLE "ProductWatch";

-- CreateTable
CREATE TABLE "OfferWatch" (
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferWatch_pkey" PRIMARY KEY ("userId","offerId")
);

-- CreateIndex
CREATE INDEX "OfferWatch_offerId_idx" ON "OfferWatch"("offerId");

-- AddForeignKey
ALTER TABLE "OfferWatch" ADD CONSTRAINT "OfferWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferWatch" ADD CONSTRAINT "OfferWatch_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
