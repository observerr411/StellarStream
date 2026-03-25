import { config } from "./config";

const STROOPS_PER_XLM = 10_000_000n;

/**
 * Returns true when the stream's total_amount exceeds the Mega Stream threshold.
 * total_amount is stored in stroops (i128 on-chain → BigInt here).
 */
export function isMegaStream(totalAmountStroops: bigint): boolean {
  return totalAmountStroops >= config.megaStreamThreshold;
}

/** Converts stroops to a human-readable XLM string (e.g. "5,000.00"). */
export function stroopsToXlm(stroops: bigint): string {
  const whole = stroops / STROOPS_PER_XLM;
  const frac = stroops % STROOPS_PER_XLM;
  const fracStr = frac.toString().padStart(7, "0").slice(0, 2); // 2 decimal places
  return `${whole.toLocaleString("en-US")}.${fracStr}`;
}
