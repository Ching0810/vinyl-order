-- CreateTable
CREATE TABLE "CatalogEntry" (
    "id" TEXT NOT NULL,
    "supplier" "Supplier" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "searchTitle" TEXT NOT NULL,
    "imageUrl" TEXT,
    "priceCents" INTEGER,
    "isVinyl" BOOLEAN NOT NULL,
    "isUsed" BOOLEAN NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogEntry_searchTitle_idx" ON "CatalogEntry" USING GIN ("searchTitle" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "CatalogEntry_supplier_externalId_key" ON "CatalogEntry"("supplier", "externalId");
