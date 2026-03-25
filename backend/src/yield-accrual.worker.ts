import { schedule, type ScheduledTask } from "node-cron";
import { logger } from "./logger.js";
import { AuditLogService } from "./services/audit-log.service.js";
import { YieldAccrualService } from "./services/yield-accrual.service.js";

const YIELD_ACCRUAL_SCHEDULE = "0 */6 * * *";

export class YieldAccrualWorker {
  private task: ScheduledTask | null = null;
  private isRunningJob = false;
  private readonly auditLogService: AuditLogService;
  private yieldAccrualService: YieldAccrualService | null;

  constructor(
    yieldAccrualService?: YieldAccrualService,
    auditLogService: AuditLogService = new AuditLogService(),
  ) {
    this.yieldAccrualService = yieldAccrualService ?? null;
    this.auditLogService = auditLogService;
  }

  start(): void {
    if (this.task !== null) {
      logger.warn("YieldAccrualWorker is already running");
      return;
    }

    if (this.yieldAccrualService === null) {
      try {
        this.yieldAccrualService = new YieldAccrualService();
      } catch (error) {
        logger.warn(
          "YieldAccrualWorker disabled; missing runtime configuration",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return;
      }
    }

    const service = this.yieldAccrualService;
    if (service === null) {
      return;
    }

    this.task = schedule(YIELD_ACCRUAL_SCHEDULE, async () => {
      if (this.isRunningJob) {
        logger.warn(
          "Skipping yield accrual run because a previous run is still active",
        );
        return;
      }

      this.isRunningJob = true;
      logger.info("Periodic yield accrual job triggered");

      try {
        const report = await service.runAccrualCycle();

        for (let index = 0; index < report.updates.length; index += 1) {
          const update = report.updates[index];

          await this.auditLogService.logEvent({
            eventType: "YieldUpdate",
            streamId: update.streamId,
            txHash: report.runId,
            eventIndex: index,
            ledger: report.latestLedger ?? 0,
            ledgerClosedAt: report.checkedAt,
            amount: BigInt(update.accruedInterest),
            metadata: {
              databaseId: update.databaseId,
              vaultContractId: update.vaultContractId,
              shareBalance: update.shareBalance,
              principalAmount: update.principalAmount,
              previousAccruedInterest: update.previousAccruedInterest,
              accruedInterest: update.accruedInterest,
              currentVaultAssets: update.currentVaultAssets,
              valuationMethod: update.valuationMethod,
              checkedAt: report.checkedAt,
            },
          });
        }

        logger.info("Yield accrual updates stored in audit log", {
          runId: report.runId,
          updatedStreams: report.updatedStreams,
          skippedStreams: report.skippedStreams,
          failedStreams: report.failedStreams,
        });
      } catch (error) {
        logger.error("Periodic yield accrual job failed", error);
      } finally {
        this.isRunningJob = false;
      }
    });

    logger.info("YieldAccrualWorker started", {
      schedule: YIELD_ACCRUAL_SCHEDULE,
    });
  }

  stop(): void {
    if (this.task === null) {
      return;
    }

    this.task.stop();
    this.task = null;
    logger.info("YieldAccrualWorker stopped");
  }
}
