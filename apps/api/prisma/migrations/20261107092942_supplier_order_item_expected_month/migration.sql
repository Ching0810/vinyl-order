/*
  Warnings:

  - You are about to drop the column `expectedAt` on the `SupplierOrderItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "SupplierOrderItem" DROP COLUMN "expectedAt",
ADD COLUMN     "expectedMonth" CHAR(7);

-- Dropping rather than converting is safe here: no supplier order had been
-- recorded yet, locally or in production.

-- Only real months: "2026-11", never "2026-13" or a day. Prisma can't
-- express a CHECK, so it lives here, like Offer's.
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_expectedMonth_format"
  CHECK ("expectedMonth" IS NULL OR "expectedMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
