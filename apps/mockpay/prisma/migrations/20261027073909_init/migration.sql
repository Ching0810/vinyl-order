-- CreateEnum
CREATE TYPE "MockPayOutcome" AS ENUM ('open', 'paid', 'declined', 'expired');

-- CreateTable
CREATE TABLE "MockPaySession" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "returnUrl" TEXT NOT NULL,
    "webhookDelayMs" INTEGER NOT NULL,
    "outcome" "MockPayOutcome" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MockPaySession_pkey" PRIMARY KEY ("id")
);
