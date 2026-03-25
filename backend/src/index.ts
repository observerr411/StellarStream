import { config } from "./config";
import { pollForMegaStreams } from "./indexer";

console.log("🌊 StellarStream Notification Service starting...");
console.log(`   Contract : ${config.contractAddress}`);
console.log(`   RPC      : ${config.sorobanRpcUrl}`);
console.log(
  `   Threshold: ${config.megaStreamThreshold.toLocaleString()} stroops (≥ 5,000 XLM)`
);
console.log(`   Interval : ${config.pollIntervalMs}ms\n`);

// Run immediately, then on every interval
pollForMegaStreams();
setInterval(pollForMegaStreams, config.pollIntervalMs);
