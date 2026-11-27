-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('price_drop');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "fromPriceCents" INTEGER NOT NULL,
    "toPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification"("userId", "createdAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (hand-written: Prisma's schema cannot express a partial index)
-- The header's unread count (tracker.md §5.10): only a member's unread rows,
-- which reading the page empties, so it stays small however many they keep.
CREATE INDEX "Notification_userId_unread_idx"
  ON "Notification" ("userId")
  WHERE "readAt" IS NULL;
