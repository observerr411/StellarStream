import { schedule, type ScheduledTask } from "node-cron";
import { logger } from "./logger.js";
import { AuditLogService } from "./services/audit-log.service.js";
import { DataIntegrityService } from "./services/data-integrity.service.js";

// Weekly on Sunday at 04:00 UTC.
const INTEGRITY_SCHEDULE = "0 4 * * 0";

export class DataIntegrityWorker {
  private task: ScheduledTask | null = null;
  private isRunningJob = false;
  private readonly auditLogService: AuditLogService;
  private dataIntegrityService: DataIntegrityService | null;

  constructor(
    dataIntegrityService?: DataIntegrityService,
    auditLogService: AuditLogService = new AuditLogService(),
  ) {
    this.dataIntegrityService = dataIntegrityService ?? null;
    this.auditLogService = auditLogService;
  }

  start(): void {
    if (this.task !== null) {
      logger.warn("DataIntegrityWorker is already running");
      return;
    }

    if (this.dataIntegrityService === null) {
      try {
        this.dataIntegrityService = new DataIntegrityService();
      } catch (error) {
        logger.warn(
          "DataIntegrityWorker disabled; missing runtime configuration",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
        return;
      }
    }

    const service = this.dataIntegrityService;
    if (service === null) {
      return;
    }

    this.task = schedule(INTEGRITY_SCHEDULE, async () => {
      if (this.isRunningJob) {
        logger.warn(
          "Skipping data integrity run because a previous run is still active",
        );
        return;
      }

      this.isRunningJob = true;
      logger.info("Weekly data integrity job triggered");

      try {
        const report = await service.runWeeklyVerification();

        await this.auditLogService.logEvent({
          eventType: "data_integrity_report",
          streamId: "system",
          txHash: report.reportId,
          eventIndex: 0,
          ledger: report.latestLedger ?? 0,
          ledgerClosedAt: new Date().toISOString(),
          metadata: {
            generatedAt: report.generatedAt,
            schedule: report.schedule,
            totalRowsScanned: report.totalRowsScanned,
            verifiedRows: report.verifiedRows,
            mismatchedRows: report.mismatchedRows,
            missingOnChainRows: report.missingOnChainRows,
            backfilledRows: report.backfilledRows,
            errorRows: report.errorRows,
            durationMs: report.durationMs,
            mismatches: report.mismatches,
          },
        });

        logger.info("Data integrity report stored in audit log", {
          reportId: report.reportId,
          mismatchedRows: report.mismatchedRows,
        });
      } catch (error) {
        logger.error("Weekly data integrity job failed", error);
      } finally {
        this.isRunningJob = false;
      }
    });

    logger.info("DataIntegrityWorker started", {
      schedule: INTEGRITY_SCHEDULE,
    });
  }

  stop(): void {
    if (this.task === null) {
      return;
    }

    this.task.stop();
    this.task = null;
    logger.info("DataIntegrityWorker stopped");
  }
}
