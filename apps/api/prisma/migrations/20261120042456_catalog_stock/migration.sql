-- AlterTable
ALTER TABLE "CatalogEntry" ADD COLUMN     "availability" "Availability",
ADD COLUMN     "stockQty" INTEGER;

-- CreateTable
CREATE TABLE "CatalogStockRun" (
    "supplier" "Supplier" NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "pages" INTEGER NOT NULL,
    "entries" INTEGER NOT NULL,

    CONSTRAINT "CatalogStockRun_pkey" PRIMARY KEY ("supplier")
);
