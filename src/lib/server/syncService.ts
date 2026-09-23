import type { AppConfig } from '$lib/types/config.js';
import type { DriveFileItem, SheetRecord, SyncSummary, BatchJobRecord } from '$lib/types/ocr.js';
import { AppscriptClient } from './appscriptClient.js';
import { GeminiClient } from './geminiClient.js';
import { GeminiBatchClient, type BatchItemInput } from './geminiBatchClient.js';
import { logger } from './logger.js';

export class SyncService {
  private config: AppConfig;
  private appscriptClient: AppscriptClient;
  private geminiClient: GeminiClient;
  private geminiBatchClient: GeminiBatchClient;
  private isRunning: boolean = false;
  private isPollingRunning: boolean = false;
  private activeOperationsCount: number = 0;
  private lastSummary: SyncSummary | null = null;
  private lastSyncTime: string | null = null;

  constructor(
    config: AppConfig,
    appscriptClient: AppscriptClient,
    geminiClient: GeminiClient,
    geminiBatchClient?: GeminiBatchClient,
  ) {
    this.config = config;
    this.appscriptClient = appscriptClient;
    this.geminiClient = geminiClient;
    this.geminiBatchClient = geminiBatchClient || new GeminiBatchClient(config.geminiApiKey);
  }

  public isBusy(): boolean {
    return this.isRunning || this.isPollingRunning || this.activeOperationsCount > 0;
  }

  public getLastSummary(): SyncSummary | null {
    return this.lastSummary;
  }

  public getLastSyncTime(): string | null {
    return this.lastSyncTime;
  }

  /**
   * Scan Drive folder & subfolders, compute hash, and insert pending rows into Google Sheet (NO OCR).
   */
  async discoverAndSyncSheet(): Promise<{ discovered: number; total: number; books: string[] }> {
    logger.info('=== Starting Google Drive Scan (Discovery Only) ===');

    const driveRes = await this.appscriptClient.listImages(this.config.driveFolderId);
    const driveFiles = driveRes.files || [];
    logger.info(`Found ${driveFiles.length} image(s) on Google Drive across folders.`);

    const existingRecords = await this.appscriptClient.readSheetRows();
    const recordById = new Map<string, SheetRecord>();
    for (const rec of existingRecords) {
      if (rec.driveFileId) recordById.set(rec.driveFileId, rec);
      else if (rec.fileName) recordById.set(rec.fileName, rec);
    }

    let discoveredCount = 0;
    const booksSet = new Set<string>();
    const newRecordsToAppend: SheetRecord[] = [];

    for (const file of driveFiles) {
      const book = file.bookName || 'Default';
      booksSet.add(book);

      const existing = recordById.get(file.id) || recordById.get(file.name);
      if (!existing) {
        const newRecord: SheetRecord = {
          fileName: file.name,
          status: 'pending',
          driveFileId: file.id,
          ocrText: '',
          errorMessage: '',
          note: '',
          bookName: book,
          batchId: '',
          batchRequestKey: file.id,
        };
        newRecordsToAppend.push(newRecord);
        recordById.set(file.id, newRecord);
      }
    }

    if (newRecordsToAppend.length > 0) {
      logger.info(
        `Batch inserting ${newRecordsToAppend.length} new records into Google Sheet in 1 request...`,
      );
      await this.appscriptClient.appendRows(newRecordsToAppend);
      discoveredCount = newRecordsToAppend.length;
      logger.info(`Added ${discoveredCount} newly discovered images to Google Sheet as "pending".`);
    } else {
      logger.info(`Google Sheet is up to date (${existingRecords.length} records).`);
    }

    this.lastSyncTime = new Date().toISOString();

    return {
      discovered: discoveredCount,
      total: driveFiles.length,
      books: Array.from(booksSet),
    };
  }

  /**
   * Run sync cycle depending on configuration mode (Batch or Direct Sync).
   */
  async runSyncCycle(): Promise<SyncSummary> {
    if (this.config.useBatchMode) {
      return this.submitPendingBatches();
    } else {
      return this.runDirectSyncCycle();
    }
  }

  /**
   * Batch Mode: Discover images, group by bookName, and submit to Gemini Batch API.
   */
  async submitPendingBatches(targetBookName?: string): Promise<SyncSummary> {
    if (this.isRunning) {
      logger.warn('Previous batch submission cycle is still running. Skipping.');
      return { discovered: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    this.isRunning = true;
    logger.info(
      `=== Starting Batch Submission Cycle ${targetBookName ? `for "${targetBookName}"` : ''} ===`,
    );

    const summary: SyncSummary = {
      discovered: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      // 1. Scan Drive for images (including subfolders for bookName)
      const driveRes = await this.appscriptClient.listImages(this.config.driveFolderId);
      const driveFiles = driveRes.files || [];
      logger.info(
        `Found ${driveFiles.length} image(s) across folders in "${driveRes.folderName || this.config.driveFolderId}".`,
      );

      // 2. Read existing Sheet records
      const existingRecords = await this.appscriptClient.readSheetRows();
      const recordById = new Map<string, SheetRecord>();
      for (const rec of existingRecords) {
        if (rec.driveFileId) recordById.set(rec.driveFileId, rec);
        else if (rec.fileName) recordById.set(rec.fileName, rec);
      }

      // 3. Append newly discovered images
      const newRecordsToAppend: SheetRecord[] = [];
      for (const file of driveFiles) {
        const existing = recordById.get(file.id) || recordById.get(file.name);
        if (!existing) {
          const newRecord: SheetRecord = {
            fileName: file.name,
            status: 'pending',
            driveFileId: file.id,
            ocrText: '',
            errorMessage: '',
            note: '',
            bookName: file.bookName || 'Default',
            batchId: '',
            batchRequestKey: file.id,
          };
          newRecordsToAppend.push(newRecord);
          recordById.set(file.id, newRecord);
          summary.discovered++;
        }
      }

      if (newRecordsToAppend.length > 0) {
        logger.info(
          `Batch inserting ${newRecordsToAppend.length} new records into Google Sheet in 1 request...`,
        );
        await this.appscriptClient.appendRows(newRecordsToAppend);
        logger.info(`Added ${summary.discovered} new record(s) to Sheet.`);
      }

      // 4. Refresh records to find all 'pending' images
      const refreshedRecords = await this.appscriptClient.readSheetRows();
      let pendingRecords = refreshedRecords.filter((r) => r.status === 'pending');

      if (targetBookName && targetBookName !== 'all') {
        pendingRecords = pendingRecords.filter((r) => (r.bookName || 'Default') === targetBookName);
      }

      if (pendingRecords.length === 0) {
        logger.info(
          `No pending images to batch${targetBookName ? ` for book "${targetBookName}"` : ''}.`,
        );
        this.lastSummary = summary;
        this.lastSyncTime = new Date().toISOString();
        return summary;
      }

      // 5. Group pending images by bookName
      const groupsByBook = new Map<string, SheetRecord[]>();
      for (const rec of pendingRecords) {
        const book = rec.bookName || 'Default';
        if (!groupsByBook.has(book)) {
          groupsByBook.set(book, []);
        }
        groupsByBook.get(book)!.push(rec);
      }

      const prompt = this.geminiClient.getPrompt();
      const maxPerJob = this.config.batchMaxImagesPerJob || 300;

      for (const [bookName, recordsInBook] of groupsByBook.entries()) {
        logger.info(
          `Processing book "${bookName}" with ${recordsInBook.length} pending image(s)...`,
        );

        // Chunk if larger than maxPerJob
        for (let i = 0; i < recordsInBook.length; i += maxPerJob) {
          const chunk = recordsInBook.slice(i, i + maxPerJob);

          // Mark chunk as 'batching'
          await this.appscriptClient.batchUpdateRows(
            chunk.map((c) => ({
              identifier: c.driveFileId,
              data: { status: 'batching' },
            })),
          );

          try {
            // Download Base64 for chunk images
            const batchInputs: BatchItemInput[] = [];
            for (const item of chunk) {
              const { base64, mimeType } = await this.appscriptClient.getImageBase64(
                item.driveFileId,
              );
              batchInputs.push({
                key: item.driveFileId,
                base64,
                mimeType,
              });
            }

            // Submit to Gemini Batch API
            const modelToUse = this.geminiClient.getModelName();
            const { batchId } = await this.geminiBatchClient.submitBatchJob(
              modelToUse,
              batchInputs,
              prompt,
              `${bookName}-part-${Math.floor(i / maxPerJob) + 1}`,
            );

            // Record batch job in batch_jobs sheet
            const jobRecord: BatchJobRecord = {
              batchId,
              bookName,
              submittedAt: new Date().toISOString(),
              status: 'pending',
              lastCheckedAt: new Date().toISOString(),
              totalImages: chunk.length,
            };
            await this.appscriptClient.appendBatchJob(jobRecord);

            // Update main sheet rows to 'batch_submitted'
            await this.appscriptClient.batchUpdateRows(
              chunk.map((c) => ({
                identifier: c.driveFileId,
                data: {
                  status: 'batch_submitted',
                  batchId,
                  batchRequestKey: c.driveFileId,
                },
              })),
            );

            summary.succeeded += chunk.length;
            summary.processed += chunk.length;
            logger.info(
              `Submitted batch ${batchId} for book "${bookName}" (${chunk.length} images).`,
            );
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to submit batch for book "${bookName}": ${msg}`);

            await this.appscriptClient.batchUpdateRows(
              chunk.map((c) => ({
                identifier: c.driveFileId,
                data: { status: 'error', errorMessage: msg },
              })),
            );
            summary.failed += chunk.length;
            summary.processed += chunk.length;
          }
        }
      }

      this.lastSummary = summary;
      this.lastSyncTime = new Date().toISOString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error in batch submission cycle: ${msg}`);
    } finally {
      this.isRunning = false;
    }

    return summary;
  }

  /**
   * Batch Mode: Poll running batches, download results, and update records.
   */
  async pollRunningBatches(): Promise<{ polled: number; completed: number; failed: number }> {
    if (this.isPollingRunning) {
      logger.warn('Batch poll cycle already active. Skipping.');
      return { polled: 0, completed: 0, failed: 0 };
    }

    this.isPollingRunning = true;
    const stats = { polled: 0, completed: 0, failed: 0 };

    try {
      const batchJobs = await this.appscriptClient.readBatchJobs();
      const activeJobs = batchJobs.filter((j) => j.status === 'pending' || j.status === 'running');

      logger.info(`Polling ${activeJobs.length} active batch job(s)...`);

      for (const job of activeJobs) {
        stats.polled++;
        try {
          const statusRes = await this.geminiBatchClient.checkBatchStatus(job.batchId);
          const nowIso = new Date().toISOString();

          if (statusRes.state === 'running' || statusRes.state === 'pending') {
            await this.appscriptClient.updateBatchJob(job.batchId, {
              status: statusRes.state,
              lastCheckedAt: nowIso,
            });
            logger.info(`Batch ${job.batchId} is ${statusRes.state}.`);
          } else if (statusRes.state === 'failed' || statusRes.state === 'expired') {
            stats.failed++;
            const errMsg = statusRes.errorMessage || `Batch job ${statusRes.state}`;
            await this.appscriptClient.updateBatchJob(job.batchId, {
              status: statusRes.state,
              lastCheckedAt: nowIso,
              errorMessage: errMsg,
            });
            await this.appscriptClient.updateRowsByBatchId(job.batchId, {
              status: 'error',
              errorMessage: errMsg,
            });
            logger.warn(`Batch ${job.batchId} ${statusRes.state}: ${errMsg}`);
          } else if (statusRes.state === 'completed' || statusRes.state === 'partially_completed') {
            stats.completed++;
            logger.info(
              `Batch ${job.batchId} reached ${statusRes.state}! Downloading OCR results...`,
            );

            const results = await this.geminiBatchClient.fetchBatchResults(
              job.batchId,
              statusRes.outputUri,
            );

            const allRows = await this.appscriptClient.readSheetRows();
            const jobRows = allRows.filter((r) => r.batchId === job.batchId);

            const updates: { identifier: string; data: Partial<SheetRecord> }[] = [];

            for (const row of jobRows) {
              const key = row.batchRequestKey || row.driveFileId;
              const result = results.get(key);

              if (result && result.ocrText) {
                updates.push({
                  identifier: row.driveFileId,
                  data: {
                    status: 'done',
                    ocrText: result.ocrText,
                    errorMessage: '',
                  },
                });
              } else if (result && result.error) {
                updates.push({
                  identifier: row.driveFileId,
                  data: {
                    status: 'error',
                    errorMessage: result.error,
                  },
                });
              } else {
                updates.push({
                  identifier: row.driveFileId,
                  data: {
                    status: 'error',
                    errorMessage: 'Không tìm thấy kết quả OCR trong tệp batch trả về',
                  },
                });
              }
            }

            if (updates.length > 0) {
              await this.appscriptClient.batchUpdateRows(updates);
            }

            await this.appscriptClient.updateBatchJob(job.batchId, {
              status: statusRes.state,
              lastCheckedAt: nowIso,
              errorMessage: statusRes.errorMessage || '',
            });

            logger.info(
              `Batch ${job.batchId} (${statusRes.state}) finished processing (${updates.length} items updated).`,
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Error polling batch ${job.batchId}: ${msg}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error in pollRunningBatches cycle: ${msg}`);
    } finally {
      this.isPollingRunning = false;
    }

    return stats;
  }

  /**
   * Direct Realtime Sync Mode.
   */
  private async runDirectSyncCycle(): Promise<SyncSummary> {
    if (this.isRunning) {
      logger.warn('Previous direct sync cycle is still running. Skipping.');
      return { discovered: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 };
    }

    this.isRunning = true;
    logger.info('=== Starting Direct Sync Cycle ===');

    const summary: SyncSummary = {
      discovered: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      const driveRes = await this.appscriptClient.listImages(this.config.driveFolderId);
      const driveFiles = driveRes.files || [];

      const sheetRecords = await this.appscriptClient.readSheetRows();
      const recordById = new Map<string, SheetRecord>();
      for (const rec of sheetRecords) {
        if (rec.driveFileId) recordById.set(rec.driveFileId, rec);
        else if (rec.fileName) recordById.set(rec.fileName, rec);
      }

      const newRecordsToAppend: SheetRecord[] = [];
      for (const file of driveFiles) {
        const existing = recordById.get(file.id) || recordById.get(file.name);
        if (!existing) {
          const newRecord: SheetRecord = {
            fileName: file.name,
            status: 'pending',
            driveFileId: file.id,
            ocrText: '',
            errorMessage: '',
            note: '',
            bookName: file.bookName || 'Default',
          };
          newRecordsToAppend.push(newRecord);
          recordById.set(file.id, newRecord);
          summary.discovered++;
        }
      }

      if (newRecordsToAppend.length > 0) {
        logger.info(
          `Batch inserting ${newRecordsToAppend.length} new records into Google Sheet in 1 request...`,
        );
        await this.appscriptClient.appendRows(newRecordsToAppend);
      }

      const refreshedRecords = await this.appscriptClient.readSheetRows();
      const filesToProcess: { record: SheetRecord; driveItem?: DriveFileItem }[] = [];

      const driveMap = new Map<string, DriveFileItem>();
      for (const df of driveFiles) driveMap.set(df.id, df);

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

      if (filesToProcess.length > 0) {
        await this.processBatchWithConcurrency(filesToProcess, summary);
      }

      this.lastSummary = summary;
      this.lastSyncTime = new Date().toISOString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Error in direct sync cycle: ${msg}`);
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

  private async processSingleRecord(record: SheetRecord): Promise<void> {
    logger.info(`[Processing] File: "${record.fileName}" (driveFileId: ${record.driveFileId})`);

    await this.appscriptClient.updateRow(record.driveFileId, {
      status: 'processing',
    });

    try {
      const { base64, mimeType } = await this.appscriptClient.getImageBase64(record.driveFileId);
      const result = await this.geminiClient.performOcr(
        base64,
        mimeType,
        undefined,
        record.fileName,
      );

      await this.appscriptClient.updateRow(record.driveFileId, {
        status: result.status,
        ocrText: result.text,
        note: result.note || '',
        errorMessage: result.errorMessage || '',
      });

      if (result.status === 'done') {
        logger.info(`[Done] File: "${record.fileName}" OCR completed successfully.`);
      } else {
        logger.warn(
          `[Failed] File: "${record.fileName}" OCR marked as error: ${result.errorMessage}`,
        );
      }
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
