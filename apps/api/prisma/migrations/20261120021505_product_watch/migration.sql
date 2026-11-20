-- CreateTable
CREATE TABLE "ProductWatch" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductWatch_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateIndex
CREATE INDEX "ProductWatch_productId_idx" ON "ProductWatch"("productId");

-- AddForeignKey
ALTER TABLE "ProductWatch" ADD CONSTRAINT "ProductWatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductWatch" ADD CONSTRAINT "ProductWatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
