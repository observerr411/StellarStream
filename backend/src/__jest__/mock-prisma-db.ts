import type { StreamStatus } from "../generated/client/index.js";

export type MockStreamRow = {
  id: string;
  streamId: string | null;
  txHash: string;
  sender: string;
  receiver: string;
  tokenAddress: string | null;
  amount: string;
  duration: number | null;
  version: number;
  status: StreamStatus | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELED";
  withdrawn: string | null;
  legacy: boolean;
  migrated: boolean;
  isPrivate: boolean;
  yieldEnabled: boolean;
  contractId: string | null;
};

export type MockContractEventRow = {
  id: string;
  eventId: string;
  contractId: string;
  ledgerSequence: number;
  ledgerClosedAt: string;
  txHash: string;
  eventType: string;
  eventIndex: number;
  topicsXdr: string[];
  valueXdr: string;
  decodedTopics: unknown;
  decodedValue: unknown;
  inSuccessfulContractCall: boolean;
};

export type MockWebhookRow = {
  id: string;
  url: string;
  description: string | null;
  isActive: boolean;
};

export type MockEventLogRow = {
  id: string;
  eventType: string;
  streamId: string;
  txHash: string;
  eventIndex: number;
  ledger: number;
  ledgerClosedAt: string;
  sender: string | null;
  receiver: string | null;
  amount: bigint | null;
  metadata: string | null;
};

type LedgerHashRow = { sequence: number; hash: string };

/**
 * A dedicated, isolated in-memory "test database".
 *
 * We use this because the repository's current Jest setup mocks Prisma for
 * event parsing tests; this extends that approach to cover ingestion and
 * webhook triggering logic without requiring a running Postgres instance.
 */
export const mockDb = {
  streams: [] as MockStreamRow[],
  webhooks: [] as MockWebhookRow[],
  eventLogs: [] as MockEventLogRow[],
  contractEvents: [] as MockContractEventRow[],
  ledgerHashes: [] as LedgerHashRow[],
  attemptedStreamCreates: 0,
  _idSeq: 1,

  reset(): void {
    this.streams = [];
    this.webhooks = [];
    this.eventLogs = [];
    this.contractEvents = [];
    this.ledgerHashes = [];
    this.attemptedStreamCreates = 0;
    this._idSeq = 1;
  },

  seedWebhook(input: {
    url: string;
    isActive?: boolean;
    description?: string;
  }): void {
    this.webhooks.push({
      id: `wh_${this._idSeq++}`,
      url: input.url,
      isActive: input.isActive ?? true,
      description: input.description ?? null,
    });
  },
};

function createId(prefix: string): string {
  const next = mockDb._idSeq++;
  return `${prefix}_${next}`;
}

export function createMockPrismaClient() {
  return {
    stream: {
      create: jest.fn(async (arg: { data: any }) => {
        mockDb.attemptedStreamCreates++;
        const data = arg.data as Partial<MockStreamRow>;
        const txHash = String(data.txHash ?? "");
        if (!txHash) throw new Error("stream.create: txHash is required");

        if (mockDb.streams.some((s) => s.txHash === txHash)) {
          // Mimic Prisma unique constraint on txHash.
          throw new Error(`Unique constraint failed on txHash=${txHash}`);
        }

        const row: MockStreamRow = {
          id: createId("stream"),
          streamId: data.streamId ?? null,
          txHash,
          sender: String(data.sender ?? ""),
          receiver: String(data.receiver ?? ""),
          tokenAddress: data.tokenAddress ?? null,
          amount: String(data.amount ?? "0"),
          duration: data.duration ?? null,
          version: Number(data.version ?? 1),
          status: (data.status as any) ?? "ACTIVE",
          withdrawn: data.withdrawn ?? "0",
          legacy: Boolean(data.legacy ?? false),
          migrated: Boolean(data.migrated ?? false),
          isPrivate: Boolean(data.isPrivate ?? false),
          yieldEnabled: Boolean(data.yieldEnabled ?? false),
          contractId:
            typeof data.contractId === "string" ? data.contractId : null,
        };

        mockDb.streams.push(row);
        return row;
      }),

      findMany: jest.fn(async (arg: { where?: any; orderBy?: any }) => {
        const where = arg.where ?? {};
        let rows = [...mockDb.streams];

        if (where.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((clause: any) => {
              if (typeof clause?.sender === "string")
                return row.sender === clause.sender;
              if (typeof clause?.receiver === "string")
                return row.receiver === clause.receiver;
              return false;
            }),
          );
        }

        if (where.status) {
          rows = rows.filter((row) => row.status === where.status);
        }

        if (where.tokenAddress?.in && Array.isArray(where.tokenAddress.in)) {
          const allowed = new Set(where.tokenAddress.in.map(String));
          rows = rows.filter(
            (row) => row.tokenAddress != null && allowed.has(row.tokenAddress),
          );
        }

        // Best-effort orderBy { id: "desc" } support.
        if (arg.orderBy?.id === "desc") {
          rows.sort((a, b) => (b.id > a.id ? 1 : -1));
        }

        return rows;
      }),
    },

    webhook: {
      findMany: jest.fn(async (arg: { where?: any }) => {
        const where = arg.where ?? {};
        const isActive = where.isActive;
        return mockDb.webhooks.filter((w) =>
          typeof isActive === "boolean" ? w.isActive === isActive : true,
        );
      }),
    },

    eventLog: {
      upsert: jest.fn(async (arg: any) => {
        const eventIndex: number =
          arg.where?.txHash_eventIndex?.eventIndex ?? 0;
        const txHash: string = String(
          arg.where?.txHash_eventIndex?.txHash ?? "",
        );

        const existing = mockDb.eventLogs.find(
          (e) => e.txHash === txHash && e.eventIndex === eventIndex,
        );
        const incoming = arg.create as Partial<MockEventLogRow>;

        if (existing) {
          existing.eventType = String(incoming.eventType ?? existing.eventType);
          existing.streamId = String(incoming.streamId ?? existing.streamId);
          existing.ledger = Number(incoming.ledger ?? existing.ledger);
          existing.ledgerClosedAt = String(
            incoming.ledgerClosedAt ?? existing.ledgerClosedAt,
          );
          existing.sender = incoming.sender ?? null;
          existing.receiver = incoming.receiver ?? null;
          existing.amount = (incoming.amount ?? null) as any;
          existing.metadata = incoming.metadata ?? null;
          return existing;
        }

        const row: MockEventLogRow = {
          id: createId("event"),
          eventType: String(incoming.eventType ?? ""),
          streamId: String(incoming.streamId ?? ""),
          txHash,
          eventIndex,
          ledger: Number(incoming.ledger ?? 0),
          ledgerClosedAt: String(incoming.ledgerClosedAt ?? ""),
          sender: incoming.sender ?? null,
          receiver: incoming.receiver ?? null,
          amount: (incoming.amount ?? null) as any,
          metadata: incoming.metadata ?? null,
        };
        mockDb.eventLogs.push(row);
        return row;
      }),

      findMany: jest.fn(async (_arg: any) => {
        return mockDb.eventLogs;
      }),
    },

    contractEvent: {
      upsert: jest.fn(async (arg: any) => {
        const eventId = String(arg.where?.eventId ?? arg.create?.eventId ?? "");
        const incoming = arg.create as Partial<MockContractEventRow>;
        const existing = mockDb.contractEvents.find(
          (event) => event.eventId === eventId,
        );

        if (existing) {
          existing.contractId = String(
            arg.update?.contractId ?? existing.contractId,
          );
          existing.ledgerSequence = Number(
            arg.update?.ledgerSequence ?? existing.ledgerSequence,
          );
          existing.ledgerClosedAt = String(
            arg.update?.ledgerClosedAt ?? existing.ledgerClosedAt,
          );
          existing.txHash = String(arg.update?.txHash ?? existing.txHash);
          existing.eventType = String(
            arg.update?.eventType ?? existing.eventType,
          );
          existing.eventIndex = Number(
            arg.update?.eventIndex ?? existing.eventIndex,
          );
          existing.topicsXdr = Array.isArray(arg.update?.topicsXdr)
            ? [...arg.update.topicsXdr]
            : existing.topicsXdr;
          existing.valueXdr = String(arg.update?.valueXdr ?? existing.valueXdr);
          existing.decodedTopics =
            arg.update?.decodedTopics ?? existing.decodedTopics;
          existing.decodedValue =
            arg.update?.decodedValue ?? existing.decodedValue;
          existing.inSuccessfulContractCall = Boolean(
            arg.update?.inSuccessfulContractCall ??
              existing.inSuccessfulContractCall,
          );
          return existing;
        }

        const row: MockContractEventRow = {
          id: createId("contract_event"),
          eventId,
          contractId: String(incoming.contractId ?? ""),
          ledgerSequence: Number(incoming.ledgerSequence ?? 0),
          ledgerClosedAt: String(incoming.ledgerClosedAt ?? ""),
          txHash: String(incoming.txHash ?? ""),
          eventType: String(incoming.eventType ?? ""),
          eventIndex: Number(incoming.eventIndex ?? 0),
          topicsXdr: Array.isArray(incoming.topicsXdr)
            ? [...incoming.topicsXdr]
            : [],
          valueXdr: String(incoming.valueXdr ?? ""),
          decodedTopics: incoming.decodedTopics ?? null,
          decodedValue: incoming.decodedValue ?? null,
          inSuccessfulContractCall: Boolean(
            incoming.inSuccessfulContractCall ?? true,
          ),
        };

        mockDb.contractEvents.push(row);
        return row;
      }),
    },

    ledgerHash: {
      upsert: jest.fn(async (arg: any) => {
        const sequence = Number(
          arg.where?.sequence ?? arg.create?.sequence ?? 0,
        );
        const hash = String(arg.update?.hash ?? arg.create?.hash ?? "");
        const existing = mockDb.ledgerHashes.find(
          (h) => h.sequence === sequence,
        );
        if (existing) {
          existing.hash = hash;
          return existing;
        }
        const row: LedgerHashRow = { sequence, hash };
        mockDb.ledgerHashes.push(row);
        return row;
      }),

      findMany: jest.fn(async (_arg: any) => {
        return mockDb.ledgerHashes.map((h) => ({
          sequence: h.sequence,
          hash: h.hash,
        }));
      }),
    },
  };
}

/**
 * A smaller prisma surface used by API routes (via `src/lib/db`).
 */
export function createMockLibPrisma() {
  return {
    stream: {
      findMany: jest.fn(async (arg: any) => {
        const where = arg.where ?? {};
        let rows = [...mockDb.streams];

        if (where.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((clause: any) => {
              if (typeof clause?.sender === "string")
                return row.sender === clause.sender;
              if (typeof clause?.receiver === "string")
                return row.receiver === clause.receiver;
              return false;
            }),
          );
        }

        if (where.status) {
          rows = rows.filter((row) => row.status === where.status);
        }

        if (where.tokenAddress?.in && Array.isArray(where.tokenAddress.in)) {
          const allowed = new Set(where.tokenAddress.in.map(String));
          rows = rows.filter(
            (row) => row.tokenAddress != null && allowed.has(row.tokenAddress),
          );
        }

        if (arg.orderBy?.id === "desc") {
          rows.sort((a, b) => (b.id > a.id ? 1 : -1));
        }

        return rows;
      }),
    },
    eventLog: {
      findMany: jest.fn(async () => mockDb.eventLogs),
    },
  };
}
