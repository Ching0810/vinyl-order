-- Fuzzy matching of artist names (ArtistAlias.normalized's GIN index below)
-- and, later, of catalog titles. Created before anything that uses it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "Supplier" AS ENUM ('candlelight', 'tht', 'cosmic', 'rotten_blues');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('in_stock', 'pre_order', 'sold_out');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('ordered', 'preparing', 'shipped', 'delivered', 'cancelled');

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "offerId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "supplier" "Supplier";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "artistId" TEXT,
ADD COLUMN     "edition" TEXT,
ADD COLUMN     "releaseDate" DATE;

-- CreateTable
CREATE TABLE "Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistAlias" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplier" "Supplier" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "availability" "Availability" NOT NULL,
    "stockQty" INTEGER,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "expectedAt" DATE,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL,
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSnapshot" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "availability" "Availability" NOT NULL,
    "stockQty" INTEGER,
    "expectedAt" DATE,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" TEXT NOT NULL,
    "supplier" "Supplier" NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderedAt" DATE NOT NULL,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'ordered',
    "totalCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "trackingNumber" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderItem" (
    "id" TEXT NOT NULL,
    "supplierOrderId" TEXT NOT NULL,
    "offerId" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "expectedAt" DATE,

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArtistAlias_artistId_normalized_key" ON "ArtistAlias"("artistId", "normalized");

-- CreateIndex
CREATE INDEX "ArtistAlias_normalized_idx" ON "ArtistAlias" USING GIN ("normalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Offer_productId_idx" ON "Offer"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_supplier_externalId_key" ON "Offer"("supplier", "externalId");

-- CreateIndex
CREATE INDEX "OfferSnapshot_offerId_takenAt_idx" ON "OfferSnapshot"("offerId", "takenAt" DESC);

-- CreateIndex
CREATE INDEX "SupplierOrder_status_idx" ON "SupplierOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_supplier_orderNumber_key" ON "SupplierOrder"("supplier", "orderNumber");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_supplierOrderId_idx" ON "SupplierOrderItem"("supplierOrderId");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_offerId_idx" ON "SupplierOrderItem"("offerId");

-- CreateIndex
CREATE INDEX "CartItem_offerId_idx" ON "CartItem"("offerId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtistAlias" ADD CONSTRAINT "ArtistAlias_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferSnapshot" ADD CONSTRAINT "OfferSnapshot_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Offer's counts can't go negative (tracker.md §8). Prisma's schema cannot
-- express a CHECK; these back the checkout's guard the way the CHECK in
-- checkout-orders.md backs Product.stock. stockQty may be null: the shop
-- doesn't say.
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_stockQty_non_negative" CHECK ("stockQty" IS NULL OR "stockQty" >= 0);
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_reservedQty_non_negative" CHECK ("reservedQty" >= 0);
