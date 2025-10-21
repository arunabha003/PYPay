-- CreateTable
CREATE TABLE "Merchant" (
    "address" TEXT NOT NULL,
    "payoutAddress" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "chainId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("address","chainId")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "expiry" INTEGER NOT NULL,
    "memoHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT,
    "blockNumber" INTEGER,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "blockTime" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bridge" (
    "ref" TEXT NOT NULL,
    "srcChainId" INTEGER NOT NULL,
    "dstChainId" INTEGER NOT NULL,
    "payer" TEXT NOT NULL,
    "recipient" TEXT,
    "amount" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lockTxHash" TEXT,
    "releaseTxHash" TEXT,
    "lockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bridge_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "CostQuote" (
    "chainId" INTEGER NOT NULL,
    "chainName" TEXT NOT NULL,
    "gasSponsorCostUsd" DOUBLE PRECISION NOT NULL,
    "estLatencyMs" INTEGER NOT NULL,
    "bridgeCostUsd" DOUBLE PRECISION NOT NULL,
    "totalCostUsd" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostQuote_pkey" PRIMARY KEY ("chainId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "passkeyCredentialId" TEXT NOT NULL,
    "smartAccountAddress" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "guardian" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionKey" (
    "pubKeyHash" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "validUntil" INTEGER NOT NULL,
    "policyId" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionKey_pkey" PRIMARY KEY ("pubKeyHash")
);

-- CreateIndex
CREATE INDEX "Merchant_chainId_idx" ON "Merchant"("chainId");

-- CreateIndex
CREATE INDEX "Merchant_active_idx" ON "Merchant"("active");

-- CreateIndex
CREATE INDEX "Invoice_merchant_chainId_idx" ON "Invoice"("merchant", "chainId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_chainId_idx" ON "Invoice"("chainId");

-- CreateIndex
CREATE INDEX "Receipt_merchant_chainId_idx" ON "Receipt"("merchant", "chainId");

-- CreateIndex
CREATE INDEX "Receipt_payer_idx" ON "Receipt"("payer");

-- CreateIndex
CREATE INDEX "Receipt_txHash_idx" ON "Receipt"("txHash");

-- CreateIndex
CREATE INDEX "Bridge_payer_idx" ON "Bridge"("payer");

-- CreateIndex
CREATE INDEX "Bridge_recipient_idx" ON "Bridge"("recipient");

-- CreateIndex
CREATE INDEX "Bridge_status_idx" ON "Bridge"("status");

-- CreateIndex
CREATE INDEX "Bridge_srcChainId_dstChainId_idx" ON "Bridge"("srcChainId", "dstChainId");

-- CreateIndex
CREATE UNIQUE INDEX "User_passkeyCredentialId_key" ON "User"("passkeyCredentialId");

-- CreateIndex
CREATE INDEX "User_smartAccountAddress_idx" ON "User"("smartAccountAddress");

-- CreateIndex
CREATE INDEX "SessionKey_account_idx" ON "SessionKey"("account");

-- CreateIndex
CREATE INDEX "SessionKey_active_idx" ON "SessionKey"("active");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_merchant_chainId_fkey" FOREIGN KEY ("merchant", "chainId") REFERENCES "Merchant"("address", "chainId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
