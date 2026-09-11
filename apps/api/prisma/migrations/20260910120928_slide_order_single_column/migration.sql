-- Collapse isSlide + slideOrder into one nullable column.
--
-- Order matters. slideOrder is currently NOT NULL DEFAULT 0, and every product
-- outside the carousel sits at 0. Dropping isSlide first would leave all of
-- them looking like position 0 — i.e. silently in the carousel. So the column
-- is made nullable and the non-members are cleared BEFORE the flag goes.

ALTER TABLE "Product" ALTER COLUMN "slideOrder" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "slideOrder" DROP NOT NULL;

UPDATE "Product" SET "slideOrder" = NULL WHERE NOT "isSlide";

DROP INDEX IF EXISTS "Product_isSlide_slideOrder_idx";
ALTER TABLE "Product" DROP COLUMN "isSlide";

CREATE INDEX "Product_slideOrder_idx" ON "Product"("slideOrder");
