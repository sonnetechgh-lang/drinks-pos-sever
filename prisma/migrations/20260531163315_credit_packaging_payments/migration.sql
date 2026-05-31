-- CreateEnum
CREATE TYPE "ProductBaseUnit" AS ENUM ('UNIT', 'BOTTLE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOMO', 'ADVANCE_BALANCE', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('SALE_DEBIT', 'PAYMENT_CREDIT', 'ADVANCE_APPLIED', 'CREDIT_REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'CREDIT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "baseUnit" "ProductBaseUnit" NOT NULL DEFAULT 'UNIT';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "creditAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID';

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "baseQuantity" INTEGER,
ADD COLUMN     "packageName" TEXT,
ADD COLUMN     "packageOptionId" TEXT,
ADD COLUMN     "unitsPerBase" INTEGER;

-- CreateTable
CREATE TABLE "ProductPackageOption" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitsPerBase" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductPackageOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "momoReference" TEXT,
    "note" TEXT,
    "cashierId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerLedgerEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "saleId" TEXT,
    "paymentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "momoReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

-- Backfill existing products with a default unit package option.
INSERT INTO "ProductPackageOption" ("id", "productId", "name", "unitsPerBase", "price", "isDefault", "active")
SELECT md5(random()::text || clock_timestamp()::text), "id", 'Unit', 1, "price", true, true
FROM "Product"
WHERE NOT EXISTS (
  SELECT 1 FROM "ProductPackageOption"
  WHERE "ProductPackageOption"."productId" = "Product"."id"
);

-- Backfill existing sale items before enforcing the new package fields.
UPDATE "SaleItem"
SET "packageName" = COALESCE("packageName", 'Unit'),
    "unitsPerBase" = COALESCE("unitsPerBase", 1),
    "baseQuantity" = COALESCE("baseQuantity", "quantity")
WHERE "packageName" IS NULL
   OR "unitsPerBase" IS NULL
   OR "baseQuantity" IS NULL;

ALTER TABLE "SaleItem" ALTER COLUMN "packageName" SET NOT NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "unitsPerBase" SET NOT NULL;
ALTER TABLE "SaleItem" ALTER COLUMN "baseQuantity" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_clientId_key" ON "Customer"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayment_clientId_key" ON "CustomerPayment"("clientId");

-- AddForeignKey
ALTER TABLE "ProductPackageOption" ADD CONSTRAINT "ProductPackageOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedgerEntry" ADD CONSTRAINT "CustomerLedgerEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_packageOptionId_fkey" FOREIGN KEY ("packageOptionId") REFERENCES "ProductPackageOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
