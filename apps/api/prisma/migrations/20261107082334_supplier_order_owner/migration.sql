/*
  Warnings:

  - A unique constraint covering the columns `[userId,supplier,orderNumber]` on the table `SupplierOrder` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `SupplierOrder` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "SupplierOrder_status_idx";

-- DropIndex
DROP INDEX "SupplierOrder_supplier_orderNumber_key";

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SupplierOrder_userId_status_idx" ON "SupplierOrder"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_userId_supplier_orderNumber_key" ON "SupplierOrder"("userId", "supplier", "orderNumber");

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
