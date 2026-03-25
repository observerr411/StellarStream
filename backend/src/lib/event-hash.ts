import { createHash } from "crypto";

interface EventHashInput {
  txHash: string;
  eventIndex: number;
  ledger: number;
  topicsXdr: string[];
  valueXdr: string;
}

/**
 * Canonical EventHash derived from on-chain XDR payload.
 */
export function computeEventHash(input: EventHashInput): string {
  const canonical = JSON.stringify({
    txHash: input.txHash,
    eventIndex: input.eventIndex,
    ledger: input.ledger,
    topicsXdr: input.topicsXdr,
    valueXdr: input.valueXdr,
  });

  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Soroban event IDs follow: "<ledger>-<txIndex>-<eventIndex>".
 */
export function parseSorobanEventIndex(eventId: string): number {
  const parts = eventId.split("-");
  if (parts.length < 3) {
    return 0;
  }

  const parsed = Number.parseInt(parts[parts.length - 1] ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
