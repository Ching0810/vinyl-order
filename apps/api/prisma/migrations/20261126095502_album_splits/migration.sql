-- CreateTable
CREATE TABLE "AlbumSplit" (
    "supplier" "Supplier" NOT NULL,
    "externalId" TEXT NOT NULL,
    "fromProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlbumSplit_pkey" PRIMARY KEY ("supplier","externalId")
);

-- CreateIndex
CREATE INDEX "AlbumSplit_fromProductId_idx" ON "AlbumSplit"("fromProductId");

-- AddForeignKey
ALTER TABLE "AlbumSplit" ADD CONSTRAINT "AlbumSplit_fromProductId_fkey" FOREIGN KEY ("fromProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
