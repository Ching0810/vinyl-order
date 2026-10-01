-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "shippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "redirectUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An order has a paidAt exactly when it has been paid: `paid`, or `shipped`
-- (which is only reached from `paid`). Existing orders are pending or
-- cancelled with no paidAt, so this holds without a backfill.
-- Prisma's schema cannot express CHECK constraints, so these live only here.
ALTER TABLE "Order" ADD CONSTRAINT "Order_paid_fields_match_status" CHECK (
  (status IN ('paid', 'shipped')) = ("paidAt" IS NOT NULL)
);

-- An order has a shippedAt exactly when it has shipped.
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipped_fields_match_status" CHECK (
  (status = 'shipped') = ("shippedAt" IS NOT NULL)
);
