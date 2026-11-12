-- AlterEnum
-- BEFORE keeps the type's order the same as schema.prisma's, so anything that
-- sorts by status sorts in the order an order moves.
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'ready_for_pickup' BEFORE 'delivered';

-- AlterTable
ALTER TABLE "SupplierOrder" ADD COLUMN     "paidAt" DATE;

-- Every order recorded before paidAt existed was paid; its order's day is the
-- best known day for it (tracker.md §9.1).
UPDATE "SupplierOrder" SET "paidAt" = "orderedAt";
