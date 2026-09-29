-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('customer', 'expired');

-- expiresAt is required, but existing orders have no value for it.
-- Add it nullable, backfill, then make it required.
ALTER TABLE "Order" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "Order" SET "expiresAt" = "createdAt" + interval '15 minutes';
ALTER TABLE "Order" ALTER COLUMN "expiresAt" SET NOT NULL;

ALTER TABLE "Order" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelReason" "CancelReason";

-- A cancelled order has both a time and a reason; any other order has neither.
-- Prisma's schema cannot express CHECK constraints, so this lives only here.
ALTER TABLE "Order" ADD CONSTRAINT "Order_cancel_fields_match_status" CHECK (
  (status = 'cancelled') = ("cancelledAt" IS NOT NULL AND "cancelReason" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");