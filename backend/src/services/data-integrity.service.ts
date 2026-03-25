import { SorobanRpc } from "@stellar/stellar-sdk";
import { prisma } from "../lib/db.js";
import { logger } from "../logger.js";
import { computeEventHash, parseSorobanEventIndex } from "../lib/event-hash.js";

const EVENT_HASH_METADATA_KEY = "__eventHash";
const INTEGRITY_REPORT_EVENT_TYPE = "data_integrity_report";
const PAGE_SIZE = 100;
const INTER_ROW_DELAY_MS = 20;
const SCAN_LIMIT_PER_LEDGER = 200;

interface EventLogRow {
  id: string;
  eventType: string;
  streamId: string;
  txHash: string;
  eventIndex: number;
  ledger: number;
  metadata: string | null;
}

export interface DataIntegrityMismatch {
  eventLogId: string;
  txHash: string;
  eventIndex: number;
  ledger: number;
  reason: "missing_on_chain" | "hash_mismatch" | "verification_error";
  storedHash: string | null;
  chainHash: string | null;
  errorMessage?: string;
}

export interface DataIntegrityReport {
  reportId: string;
  generatedAt: string;
  schedule: "weekly";
  totalRowsScanned: number;
  verifiedRows: number;
  mismatchedRows: number;
  missingOnChainRows: number;
  backfilledRows: number;
  errorRows: number;
  latestLedger: number | null;
  durationMs: number;
  mismatches: DataIntegrityMismatch[];
}

export class DataIntegrityService {
  private readonly server: SorobanRpc.Server;
  private readonly contractIds: string[];

  constructor(rpcUrl: string = process.env.STELLAR_RPC_URL ?? "") {
    if (!rpcUrl) {
      throw new Error(
        "STELLAR_RPC_URL is required for data integrity verification",
      );
    }

    this.server = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith("http://"),
    });
    this.contractIds = this.resolveContractIds();
  }

  async runWeeklyVerification(): Promise<DataIntegrityReport> {
    const startedAt = Date.now();
    const reportId = `integrity-${startedAt}`;

    let totalRowsScanned = 0;
    let verifiedRows = 0;
    let mismatchedRows = 0;
    let missingOnChainRows = 0;
    let backfilledRows = 0;
    let errorRows = 0;
    const mismatches: DataIntegrityMismatch[] = [];

    let cursor: string | undefined;

    logger.info("Starting weekly data integrity verification", {
      reportId,
      contractIds: this.contractIds,
    });

    while (true) {
      const rows = await this.fetchPage(cursor);
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        totalRowsScanned += 1;

        try {
          const onChainEvent = await this.findOnChainEvent(row);

          if (!onChainEvent) {
            missingOnChainRows += 1;
            mismatchedRows += 1;
            mismatches.push({
              eventLogId: row.id,
              txHash: row.txHash,
              eventIndex: row.eventIndex,
              ledger: row.ledger,
              reason: "missing_on_chain",
              storedHash: this.readStoredHash(row.metadata),
              chainHash: null,
            });
            continue;
          }

          const chainHash = computeEventHash({
            txHash: onChainEvent.txHash ?? row.txHash,
            eventIndex: parseSorobanEventIndex(onChainEvent.id),
            ledger: onChainEvent.ledger,
            topicsXdr: onChainEvent.topic.map((topic) => topic.toXDR("base64")),
            valueXdr: onChainEvent.value.toXDR("base64"),
          });

          const metadataObject = this.parseMetadata(row.metadata);
          const storedHash = this.readStoredHash(row.metadata);

          if (!storedHash) {
            metadataObject[EVENT_HASH_METADATA_KEY] = chainHash;
            await prisma.eventLog.update({
              where: { id: row.id },
              data: {
                metadata: JSON.stringify(metadataObject),
              },
            });
            backfilledRows += 1;
            verifiedRows += 1;
            continue;
          }

          if (storedHash !== chainHash) {
            mismatchedRows += 1;
            mismatches.push({
              eventLogId: row.id,
              txHash: row.txHash,
              eventIndex: row.eventIndex,
              ledger: row.ledger,
              reason: "hash_mismatch",
              storedHash,
              chainHash,
            });
            continue;
          }

          verifiedRows += 1;
        } catch (error) {
          errorRows += 1;
          mismatchedRows += 1;
          mismatches.push({
            eventLogId: row.id,
            txHash: row.txHash,
            eventIndex: row.eventIndex,
            ledger: row.ledger,
            reason: "verification_error",
            storedHash: this.readStoredHash(row.metadata),
            chainHash: null,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }

        await this.sleep(INTER_ROW_DELAY_MS);
      }

      cursor = rows[rows.length - 1]?.id;
    }

    const latestLedger = await this.getLatestLedgerSafe();
    const report: DataIntegrityReport = {
      reportId,
      generatedAt: new Date(startedAt).toISOString(),
      schedule: "weekly",
      totalRowsScanned,
      verifiedRows,
      mismatchedRows,
      missingOnChainRows,
      backfilledRows,
      errorRows,
      latestLedger,
      durationMs: Date.now() - startedAt,
      mismatches: mismatches.slice(0, 200),
    };

    logger.info("Weekly data integrity verification complete", {
      reportId,
      totalRowsScanned,
      verifiedRows,
      mismatchedRows,
      missingOnChainRows,
      backfilledRows,
      errorRows,
      durationMs: report.durationMs,
    });

    return report;
  }

  private async fetchPage(cursor?: string): Promise<EventLogRow[]> {
    return prisma.eventLog.findMany({
      where: {
        NOT: {
          eventType: INTEGRITY_REPORT_EVENT_TYPE,
        },
      },
      select: {
        id: true,
        eventType: true,
        streamId: true,
        txHash: true,
        eventIndex: true,
        ledger: true,
        metadata: true,
      },
      orderBy: {
        id: "asc",
      },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  private async findOnChainEvent(
    row: Pick<EventLogRow, "ledger" | "txHash" | "eventIndex">,
  ): Promise<SorobanRpc.Api.EventResponse | null> {
    const filter: SorobanRpc.Api.EventFilter =
      this.contractIds.length > 0
        ? {
            type: "contract",
            contractIds: this.contractIds,
          }
        : {
            type: "contract",
          };

    const response = await this.server.getEvents({
      startLedger: row.ledger,
      filters: [filter],
      limit: SCAN_LIMIT_PER_LEDGER,
    });

    const matched = (response.events ?? []).find((event) => {
      if (event.ledger !== row.ledger) {
        return false;
      }

      const eventIndex = parseSorobanEventIndex(event.id);
      return event.txHash === row.txHash && eventIndex === row.eventIndex;
    });

    return matched ?? null;
  }

  private resolveContractIds(): string[] {
    const ids = [
      process.env.CONTRACT_ID,
      process.env.NEBULA_CONTRACT_ID,
      process.env.V1_CONTRACT_ID,
    ].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    return Array.from(new Set(ids));
  }

  private parseMetadata(metadata: string | null): Record<string, unknown> {
    if (!metadata) {
      return {};
    }

    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private readStoredHash(metadata: string | null): string | null {
    const parsed = this.parseMetadata(metadata);
    const value = parsed[EVENT_HASH_METADATA_KEY];
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private async getLatestLedgerSafe(): Promise<number | null> {
    try {
      const latest = await this.server.getLatestLedger();
      return latest.sequence;
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
