ALTER TABLE "Stream"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "contract_id" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Stream' AND column_name = 'yieldEnabled'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Stream' AND column_name = 'yield_enabled'
  ) THEN
    ALTER TABLE "Stream" RENAME COLUMN "yieldEnabled" TO "yield_enabled";
  END IF;
END $$;

UPDATE "Stream"
SET "version" = CASE
  WHEN "legacy" THEN 1
  ELSE 2
END;

CREATE TABLE IF NOT EXISTS "ContractEvent" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "contract_id" TEXT NOT NULL,
  "ledger_sequence" INTEGER NOT NULL,
  "ledger_closed_at" TEXT NOT NULL,
  "tx_hash" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "event_index" INTEGER NOT NULL DEFAULT 0,
  "topics_xdr" TEXT[] NOT NULL,
  "value_xdr" TEXT NOT NULL,
  "decoded_topics" JSONB,
  "decoded_value" JSONB,
  "in_successful_contract_call" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContractEvent_event_id_key" UNIQUE ("event_id")
);

CREATE INDEX IF NOT EXISTS "ContractEvent_contract_id_ledger_sequence_idx"
  ON "ContractEvent"("contract_id", "ledger_sequence");

CREATE INDEX IF NOT EXISTS "ContractEvent_tx_hash_event_index_idx"
  ON "ContractEvent"("tx_hash", "event_index");