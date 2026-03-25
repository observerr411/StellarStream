ALTER TABLE "Stream"
  ADD COLUMN IF NOT EXISTS "yieldEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vaultContractId" TEXT,
  ADD COLUMN IF NOT EXISTS "vaultShareBalance" TEXT,
  ADD COLUMN IF NOT EXISTS "vaultRatioScale" TEXT,
  ADD COLUMN IF NOT EXISTS "accruedInterest" TEXT NOT NULL DEFAULT '0',
  ADD COLUMN IF NOT EXISTS "lastYieldAccrualAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Stream_yieldEnabled_status_idx"
  ON "Stream"("yieldEnabled", "status");