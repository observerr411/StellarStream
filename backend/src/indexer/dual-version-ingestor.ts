/**
 * Dual-Version Ingestor (Issue #481)
 *
 * Polls V1 and V2 contract IDs simultaneously.
 * - Events from V1_CONTRACT_ID are stored with legacy: true.
 * - A "migrate" event atomically marks the V1 record as migrated
 *   and creates the V2 record in a single DB transaction.
 */

import { SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import {
  Prisma,
  PrismaClient,
  StreamStatus,
} from "../generated/client/index.js";
import {
  getLastLedgerSequence,
  saveLastLedgerSequence,
} from "../services/syncMetadata.service.js";
import { logger } from "../logger.js";
import { NotificationService } from "../services/notification.service.js";
import { parseContractEvent } from "../event-parser.js";

const prisma = new PrismaClient();
const notificationService = new NotificationService();

const RPC_URL = process.env.STELLAR_RPC_URL ?? "";
const V1_CONTRACT_ID = process.env.V1_CONTRACT_ID ?? "";
const V2_CONTRACT_ID = process.env.NEBULA_CONTRACT_ID ?? "";
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawStreamPayload {
  stream_id?: unknown;
  sender?: unknown;
  receiver?: unknown;
  amount?: unknown;
  token?: unknown;
}

// ── Ingestor ──────────────────────────────────────────────────────────────────

export class DualVersionIngestor {
  private server: SorobanRpc.Server;
  private running = false;
  private pollTimeout?: NodeJS.Timeout;
  private contractIds: string[];

  constructor(rpcUrl = RPC_URL) {
    if (!V1_CONTRACT_ID) throw new Error("V1_CONTRACT_ID is not set");
    if (!V2_CONTRACT_ID) throw new Error("NEBULA_CONTRACT_ID is not set");

    this.server = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith("http://"),
    });
    this.contractIds = [V1_CONTRACT_ID, V2_CONTRACT_ID];
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    logger.info("[DualIngestor] Starting", { contractIds: this.contractIds });
    await this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    logger.info("[DualIngestor] Stopped");
  }

  // ── Poll loop ───────────────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    if (!this.running) return;
    try {
      await this.fetchAndProcess();
    } catch (err) {
      logger.error("[DualIngestor] Poll error", { err });
    }
    this.pollTimeout = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private async fetchAndProcess(): Promise<void> {
    const startLedger = await getLastLedgerSequence();

    const response = await this.server.getEvents({
      startLedger: startLedger === 0 ? undefined : startLedger + 1,
      filters: [{ type: "contract", contractIds: this.contractIds }],
    });

    const events = response.events ?? [];
    if (events.length === 0) return;

    logger.info(`[DualIngestor] Processing ${events.length} event(s)`);

    let latestLedger = startLedger;

    for (const event of events) {
      await this.handleEvent(event);
      if (event.ledger > latestLedger) latestLedger = event.ledger;
    }

    await saveLastLedgerSequence(latestLedger);
  }

  // ── Event dispatch ──────────────────────────────────────────────────────────

  private async handleEvent(
    event: SorobanRpc.Api.EventResponse,
  ): Promise<void> {
    await this.persistContractEvent(event);

    const contractId = event.contractId?.toString() ?? "";
    const isLegacy = contractId === V1_CONTRACT_ID;
    const action = this.extractAction(event);

    if (!action) return;

    if (action === "migrate") {
      await this.handleMigration(event);
      return;
    }

    const payload = this.decodePayload(event);
    if (!payload?.stream_id) return;

    const streamId = String(payload.stream_id);

    await prisma.stream.upsert({
      where: { streamId },
      update: {
        status: actionToStatus(action),
        version: isLegacy ? 1 : 2,
        contractId,
        legacy: isLegacy,
      },
      create: {
        streamId,
        txHash: event.txHash ?? event.id,
        sender: String(payload.sender ?? ""),
        receiver: String(payload.receiver ?? ""),
        tokenAddress: payload.token ? String(payload.token) : null,
        amount: String(payload.amount ?? "0"),
        version: isLegacy ? 1 : 2,
        legacy: isLegacy,
        contractId,
      },
    });

    // Fire "Stream Received" notification for new streams
    if (action === "create") {
      notificationService
        .notifyStreamReceived({
          streamId,
          sender: String(payload.sender ?? ""),
          receiver: String(payload.receiver ?? ""),
          amount: String(payload.amount ?? "0"),
          tokenAddress: payload.token ? String(payload.token) : null,
          txHash: event.txHash ?? event.id,
        })
        .catch((err) =>
          logger.error("[DualIngestor] Notification dispatch error", { err }),
        );
    }
  }

  /**
   * Atomically mark the V1 record as migrated and create the V2 record.
   */
  private async handleMigration(
    event: SorobanRpc.Api.EventResponse,
  ): Promise<void> {
    const payload = this.decodePayload(event);
    if (!payload?.stream_id) return;

    const v1StreamId = String(payload.stream_id);

    await prisma.$transaction([
      // Mark V1 record as migrated
      prisma.stream.updateMany({
        where: { streamId: v1StreamId, legacy: true },
        data: {
          migrated: true,
          version: 1,
          contractId: V1_CONTRACT_ID,
        },
      }),
      // Create V2 record
      prisma.stream.create({
        data: {
          streamId: `${v1StreamId}-v2`,
          txHash: event.txHash ?? event.id,
          sender: String(payload.sender ?? ""),
          receiver: String(payload.receiver ?? ""),
          tokenAddress: payload.token ? String(payload.token) : null,
          amount: String(payload.amount ?? "0"),
          version: 2,
          legacy: false,
          migrated: false,
          contractId: V2_CONTRACT_ID,
        },
      }),
    ]);

    logger.info("[DualIngestor] Stream migrated V1→V2", { v1StreamId });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private extractAction(event: SorobanRpc.Api.EventResponse): string | null {
    try {
      const native = scValToNative(event.topic[0]);
      return typeof native === "string" ? native.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  private decodePayload(
    event: SorobanRpc.Api.EventResponse,
  ): RawStreamPayload | null {
    try {
      const native = scValToNative(event.value);
      return typeof native === "object" && native !== null
        ? (native as RawStreamPayload)
        : null;
    } catch {
      return null;
    }
  }

  private async persistContractEvent(
    event: SorobanRpc.Api.EventResponse,
  ): Promise<void> {
    const parsed = parseContractEvent(event);
    if (!parsed) {
      return;
    }

    await prisma.contractEvent.upsert({
      where: {
        eventId: parsed.id,
      },
      update: {
        contractId: parsed.contractId,
        ledgerSequence: parsed.ledger,
        ledgerClosedAt: parsed.ledgerClosedAt,
        txHash: parsed.txHash,
        eventType: this.extractAction(event) ?? parsed.type,
        eventIndex: parsed.eventIndex,
        topicsXdr: parsed.topics,
        valueXdr: event.value.toXDR("base64"),
        decodedTopics: this.normalizeForJson(
          event.topic.map((topic) => scValToNative(topic)),
        ),
        decodedValue: this.normalizeForJson(parsed.value),
        inSuccessfulContractCall: parsed.inSuccessfulContractCall,
      },
      create: {
        eventId: parsed.id,
        contractId: parsed.contractId,
        ledgerSequence: parsed.ledger,
        ledgerClosedAt: parsed.ledgerClosedAt,
        txHash: parsed.txHash,
        eventType: this.extractAction(event) ?? parsed.type,
        eventIndex: parsed.eventIndex,
        topicsXdr: parsed.topics,
        valueXdr: event.value.toXDR("base64"),
        decodedTopics: this.normalizeForJson(
          event.topic.map((topic) => scValToNative(topic)),
        ),
        decodedValue: this.normalizeForJson(parsed.value),
        inSuccessfulContractCall: parsed.inSuccessfulContractCall,
      },
    });
  }

  private normalizeForJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (value === null || value === undefined) {
      return Prisma.JsonNull;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(
        (item) => this.normalizeForJson(item) as Prisma.InputJsonValue,
      );
    }
    if (typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          this.normalizeForJson(entry),
        ]),
      ) as Prisma.InputJsonObject;
    }
    return String(value);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function actionToStatus(action: string): StreamStatus {
  switch (action) {
    case "cancel":
      return StreamStatus.CANCELED;
    case "pause":
      return StreamStatus.PAUSED;
    case "resume":
      return StreamStatus.ACTIVE;
    default:
      return StreamStatus.ACTIVE;
  }
}
