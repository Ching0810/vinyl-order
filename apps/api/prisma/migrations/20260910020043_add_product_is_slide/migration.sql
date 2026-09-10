-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isSlide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slideOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_isSlide_slideOrder_idx" ON "Product"("isSlide", "slideOrder");
