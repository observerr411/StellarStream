import {
  Account,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { StreamStatus } from "../generated/client/index.js";
import { prisma } from "../lib/db.js";
import { logger } from "../logger.js";

const DEFAULT_RATIO_SCALE = "10000000";
const DEFAULT_ASSET_METHODS = [
  "convert_to_assets",
  "shares_to_assets",
  "preview_redeem",
  "get_assets_for_shares",
];
const DEFAULT_RATIO_METHODS = [
  "get_assets_per_share",
  "assets_per_share",
  "share_price",
  "shares_to_asset_ratio",
];

export interface YieldAccrualUpdate {
  streamId: string;
  databaseId: string;
  vaultContractId: string;
  shareBalance: string;
  principalAmount: string;
  previousAccruedInterest: string;
  accruedInterest: string;
  currentVaultAssets: string;
  valuationMethod: "asset_call" | "ratio_call";
}

export interface YieldAccrualReport {
  runId: string;
  checkedAt: string;
  latestLedger: number | null;
  scannedStreams: number;
  updatedStreams: number;
  skippedStreams: number;
  failedStreams: number;
  updates: YieldAccrualUpdate[];
}

export class YieldAccrualService {
  private readonly rpcServer: SorobanRpc.Server;
  private readonly networkPassphrase: string;
  private readonly assetMethodCandidates: string[];
  private readonly ratioMethodCandidates: string[];
  private readonly defaultRatioScale: bigint;

  constructor(rpcUrl: string = process.env.STELLAR_RPC_URL ?? "") {
    if (!rpcUrl) {
      throw new Error(
        "STELLAR_RPC_URL is required for yield accrual processing",
      );
    }

    this.networkPassphrase =
      process.env.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
    this.assetMethodCandidates = this.parseMethodList(
      process.env.YIELD_VAULT_ASSET_METHODS,
      DEFAULT_ASSET_METHODS,
    );
    this.ratioMethodCandidates = this.parseMethodList(
      process.env.YIELD_VAULT_RATIO_METHODS,
      DEFAULT_RATIO_METHODS,
    );
    this.defaultRatioScale =
      this.parseBigInt(
        process.env.YIELD_VAULT_RATIO_SCALE ?? DEFAULT_RATIO_SCALE,
      ) ?? BigInt(DEFAULT_RATIO_SCALE);

    this.rpcServer = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith("http://"),
    });
  }

  async runAccrualCycle(): Promise<YieldAccrualReport> {
    const startedAt = Date.now();
    const runId = `yield-accrual-${startedAt}`;
    const checkedAt = new Date(startedAt).toISOString();

    const streams = await prisma.stream.findMany({
      where: {
        status: StreamStatus.ACTIVE,
        yieldEnabled: true,
      },
      select: {
        id: true,
        streamId: true,
        amount: true,
        accruedInterest: true,
        vaultContractId: true,
        vaultShareBalance: true,
        vaultRatioScale: true,
      },
    });

    let updatedStreams = 0;
    let skippedStreams = 0;
    let failedStreams = 0;
    const updates: YieldAccrualUpdate[] = [];

    logger.info("Starting yield accrual cycle", {
      runId,
      streamCount: streams.length,
    });

    for (const stream of streams) {
      if (!stream.vaultContractId || !stream.vaultShareBalance) {
        skippedStreams += 1;
        logger.warn(
          "Skipping yield accrual for incompletely configured stream",
          {
            streamId: stream.streamId ?? stream.id,
            vaultContractId: stream.vaultContractId,
            vaultShareBalance: stream.vaultShareBalance,
          },
        );
        continue;
      }

      try {
        const principalAmount = this.parseBigInt(stream.amount) ?? 0n;
        const previousAccruedInterest =
          this.parseBigInt(stream.accruedInterest) ?? 0n;
        const shareBalance = this.parseBigInt(stream.vaultShareBalance);

        if (shareBalance === null) {
          skippedStreams += 1;
          logger.warn(
            "Skipping yield accrual because vault share balance is invalid",
            {
              streamId: stream.streamId ?? stream.id,
              vaultShareBalance: stream.vaultShareBalance,
            },
          );
          continue;
        }

        const valuation = await this.resolveCurrentAssetValue({
          vaultContractId: stream.vaultContractId,
          shareBalance,
          ratioScale: this.parseBigInt(stream.vaultRatioScale),
        });

        const accruedInterest =
          valuation.currentAssets > principalAmount
            ? valuation.currentAssets - principalAmount
            : 0n;

        await prisma.stream.update({
          where: { id: stream.id },
          data: {
            accruedInterest: accruedInterest.toString(),
            lastYieldAccrualAt: new Date(checkedAt),
          },
        });

        if (accruedInterest !== previousAccruedInterest) {
          updatedStreams += 1;
          updates.push({
            streamId: stream.streamId ?? stream.id,
            databaseId: stream.id,
            vaultContractId: stream.vaultContractId,
            shareBalance: shareBalance.toString(),
            principalAmount: principalAmount.toString(),
            previousAccruedInterest: previousAccruedInterest.toString(),
            accruedInterest: accruedInterest.toString(),
            currentVaultAssets: valuation.currentAssets.toString(),
            valuationMethod: valuation.method,
          });
        }
      } catch (error) {
        failedStreams += 1;
        logger.error("Yield accrual calculation failed", error, {
          streamId: stream.streamId ?? stream.id,
          vaultContractId: stream.vaultContractId,
        });
      }
    }

    const latestLedger = await this.getLatestLedgerSafe();
    const report: YieldAccrualReport = {
      runId,
      checkedAt,
      latestLedger,
      scannedStreams: streams.length,
      updatedStreams,
      skippedStreams,
      failedStreams,
      updates,
    };

    logger.info("Yield accrual cycle completed", {
      runId,
      scannedStreams: report.scannedStreams,
      updatedStreams,
      skippedStreams,
      failedStreams,
      durationMs: Date.now() - startedAt,
    });

    return report;
  }

  private async resolveCurrentAssetValue(input: {
    vaultContractId: string;
    shareBalance: bigint;
    ratioScale: bigint | null;
  }): Promise<{ currentAssets: bigint; method: "asset_call" | "ratio_call" }> {
    const directAssetValue = await this.tryAssetMethods(
      input.vaultContractId,
      input.shareBalance,
    );
    if (directAssetValue !== null) {
      return {
        currentAssets: directAssetValue,
        method: "asset_call",
      };
    }

    const ratio = await this.tryRatioMethods(input.vaultContractId);
    if (ratio !== null) {
      const ratioScale = input.ratioScale ?? this.defaultRatioScale;
      if (ratioScale <= 0n) {
        throw new Error("Vault ratio scale must be greater than zero");
      }

      return {
        currentAssets: (input.shareBalance * ratio) / ratioScale,
        method: "ratio_call",
      };
    }

    throw new Error(
      "No supported vault valuation method responded successfully",
    );
  }

  private async tryAssetMethods(
    vaultContractId: string,
    shareBalance: bigint,
  ): Promise<bigint | null> {
    for (const method of this.assetMethodCandidates) {
      const i128Result = await this.simulateBigIntCall(
        vaultContractId,
        method,
        [nativeToScVal(shareBalance, { type: "i128" })],
      );
      if (i128Result !== null) {
        return i128Result;
      }

      const u128Result = await this.simulateBigIntCall(
        vaultContractId,
        method,
        [nativeToScVal(shareBalance, { type: "u128" })],
      );
      if (u128Result !== null) {
        return u128Result;
      }
    }

    return null;
  }

  private async tryRatioMethods(
    vaultContractId: string,
  ): Promise<bigint | null> {
    for (const method of this.ratioMethodCandidates) {
      const ratio = await this.simulateBigIntCall(vaultContractId, method, []);
      if (ratio !== null) {
        return ratio;
      }
    }

    return null;
  }

  private async simulateBigIntCall(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<bigint | null> {
    const contract = new Contract(contractId);
    const source = new Account(Keypair.random().publicKey(), "0");

    try {
      const tx = new TransactionBuilder(source, {
        fee: "100",
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(30)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(tx);
      if ("error" in simulation) {
        logger.debug("Vault simulation returned an error", {
          contractId,
          method,
          error: simulation.error,
        });
        return null;
      }

      const retval = simulation.result?.retval;
      if (!retval) {
        return null;
      }

      return this.parseBigIntScVal(retval);
    } catch (error) {
      logger.debug("Vault simulation call failed", {
        contractId,
        method,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private parseBigIntScVal(value: unknown): bigint | null {
    try {
      if (typeof value === "string") {
        return this.parseBigInt(
          scValToNative(xdr.ScVal.fromXDR(value, "base64")),
        );
      }
      if (value instanceof xdr.ScVal) {
        return this.parseBigInt(scValToNative(value));
      }
      return this.parseBigInt(value);
    } catch {
      return null;
    }
  }

  private parseMethodList(
    value: string | undefined,
    fallbacks: string[],
  ): string[] {
    const resolved = value
      ?.split(",")
      .map((method) => method.trim())
      .filter((method) => method.length > 0);

    return resolved && resolved.length > 0 ? resolved : fallbacks;
  }

  private parseBigInt(value: unknown): bigint | null {
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return BigInt(Math.trunc(value));
    }
    if (typeof value === "string" && value.trim().length > 0) {
      try {
        return BigInt(value);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async getLatestLedgerSafe(): Promise<number | null> {
    try {
      const latest = await this.rpcServer.getLatestLedger();
      return latest.sequence;
    } catch {
      return null;
    }
  }
}
