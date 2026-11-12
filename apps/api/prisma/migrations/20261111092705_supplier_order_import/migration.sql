-- AlterTable
ALTER TABLE "SupplierOrderItem" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "SupplierOrderImportToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierOrderImportToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrderImportToken_userId_key" ON "SupplierOrderImportToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrderImportToken_tokenHash_key" ON "SupplierOrderImportToken"("tokenHash");

-- AddForeignKey
ALTER TABLE "SupplierOrderImportToken" ADD CONSTRAINT "SupplierOrderImportToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
