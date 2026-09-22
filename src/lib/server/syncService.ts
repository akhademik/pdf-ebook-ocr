import type { AppConfig } from '$lib/types/config.js';
import type { DriveFileItem, SheetRecord, SyncSummary } from '$lib/types/ocr.js';
import { AppscriptClient } from './appscriptClient.js';
import { GeminiClient } from './geminiClient.js';
import { logger } from './logger.js';

export class SyncService {
  private config: AppConfig;
  private appscriptClient: AppscriptClient;
  private geminiClient: GeminiClient;
  private isRunning: boolean = false;
  private activeOperationsCount: number = 0;
  private lastSummary: SyncSummary | null = null;
  private lastSyncTime: string | null = null;

  constructor(config: AppConfig, appscriptClient: AppscriptClient, geminiClient: GeminiClient) {
    this.config = config;
    this.appscriptClient = appscriptClient;
    this.geminiClient = geminiClient;
  }

  public isBusy(): boolean {
    return this.isRunning || this.activeOperationsCount > 0;
  }

  public getLastSummary(): SyncSummary | null {
    return this.lastSummary;
  }

  public getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  /**
   * Run one complete synchronization cycle.
   */
  async runSyncCycle(): Promise<SyncSummary> {
    if (this.isRunning) {
      logger.warn('Previous sync cycle is still running. Skipping this tick.');
      return { discovered: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    this.isRunning = true;
    logger.info('=== Starting Sync Cycle ===');

    const summary: SyncSummary = {
      discovered: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      // Step 1: List all image files from Drive folder via Apps Script
      const driveRes = await this.appscriptClient.listImages(this.config.driveFolderId);
      const driveFiles = driveRes.files || [];
      logger.info(
        `Found ${driveFiles.length} image file(s) in Drive folder "${driveRes.folderName || this.config.driveFolderId}".`,
      );

      // Step 2: Read existing records from Google Sheet via Apps Script
      const sheetRecords = await this.appscriptClient.readSheetRows();
      const recordById = new Map<string, SheetRecord>();
      for (const rec of sheetRecords) {
        if (rec.driveFileId) {
          recordById.set(rec.driveFileId, rec);
        } else if (rec.fileName) {
          recordById.set(rec.fileName, rec);
        }
      }

      // Step 3: Identify new files to insert into Sheet
      for (const file of driveFiles) {
        const existing = recordById.get(file.id) || recordById.get(file.name);
        if (!existing) {
          const newRecord: SheetRecord = {
            fileName: file.name,
            status: 'pending',
            driveFileId: file.id,
            ocrText: '',
            errorMessage: '',
            note: file.md5Checksum || '',
          };
          await this.appscriptClient.appendRow(newRecord);
          recordById.set(file.id, newRecord);
          summary.discovered++;
        }
      }

      if (summary.discovered > 0) {
        logger.info(`Added ${summary.discovered} new record(s) to Sheet.`);
      }

      // Step 4: Refresh records to determine which files need processing
      const refreshedRecords = await this.appscriptClient.readSheetRows();
      const filesToProcess: { record: SheetRecord; driveItem?: DriveFileItem }[] = [];

      const driveMap = new Map<string, DriveFileItem>();
      for (const df of driveFiles) {
        driveMap.set(df.id, df);
      }

      for (const rec of refreshedRecords) {
        const fileId = rec.driveFileId;
        if (!fileId) continue;

        if (rec.status === 'done') {
          summary.skipped++;
          continue;
        }

        const driveItem = driveMap.get(fileId);
        filesToProcess.push({ record: rec, driveItem });
      }

      logger.info(`Total items needing OCR: ${filesToProcess.length}`);

      // Step 5: Process files with concurrency control
      if (filesToProcess.length > 0) {
        await this.processBatchWithConcurrency(filesToProcess, summary);
      }

      this.lastSummary = summary;
      this.lastSyncTime = new Date().toISOString();

      logger.info(
        `=== Sync Cycle Finished: Discovered ${summary.discovered} | Succeeded ${summary.succeeded} | Failed ${summary.failed} | Skipped ${summary.skipped} ===`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error occurred during sync cycle: ${msg}`);
    } finally {
      this.isRunning = false;
    }

    return summary;
  }

  /**
   * Process a single file directly on demand.
   */
  async processSingleFileById(fileId: string): Promise<SheetRecord> {
    const records = await this.appscriptClient.readSheetRows();
    const rec = records.find((r) => r.driveFileId === fileId);
    if (!rec) {
      throw new Error(`Record with driveFileId ${fileId} not found in Sheet`);
    }

    await this.processSingleRecord(rec);
    const updated = await this.appscriptClient.readSheetRows();
    const result = updated.find((r) => r.driveFileId === fileId);
    if (!result) throw new Error('Failed to retrieve updated record');
    return result;
  }

  /**
   * Process items with maximum concurrency.
   */
  private async processBatchWithConcurrency(
    items: { record: SheetRecord; driveItem?: DriveFileItem }[],
    summary: SyncSummary,
  ): Promise<void> {
    const queue = [...items];
    const concurrency = this.config.maxConcurrency;

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        this.activeOperationsCount++;
        try {
          await this.processSingleRecord(item.record);
          summary.succeeded++;
        } catch {
          summary.failed++;
        } finally {
          this.activeOperationsCount--;
          summary.processed++;
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
  }

  /**
   * Process a single OCR record: Apps Script Drive download -> Gemini OCR -> Apps Script Sheet update.
   */
  private async processSingleRecord(record: SheetRecord): Promise<void> {
    logger.info(`[Processing] File: "${record.fileName}" (driveFileId: ${record.driveFileId})`);

    // 1. Mark as processing
    await this.appscriptClient.updateRow(record.driveFileId, {
      status: 'processing',
    });

    try {
      // 2. Download image base64 from Drive via Apps Script
      const { base64, mimeType } = await this.appscriptClient.getImageBase64(record.driveFileId);

      // 3. Call Gemini OCR
      const ocrText = await this.geminiClient.performOcr(base64, mimeType);

      // 4. Update Sheet as done
      await this.appscriptClient.updateRow(record.driveFileId, {
        status: 'done',
        ocrText: ocrText,
        errorMessage: '',
      });

      logger.info(`[Done] File: "${record.fileName}" OCR completed successfully.`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[Error] File: "${record.fileName}" OCR failed: ${errorMsg}`);

      await this.appscriptClient.updateRow(record.driveFileId, {
        status: 'error',
        errorMessage: errorMsg,
      });

      throw err;
    }
  }
}
