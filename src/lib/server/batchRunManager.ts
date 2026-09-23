import type { BatchRun } from '$lib/types/batchRun.js';
import type { SheetRecord, BatchJobRecord } from '$lib/types/ocr.js';
import type { AppscriptClient } from './appscriptClient.js';
import type { GeminiClient } from './geminiClient.js';
import type { GeminiBatchClient, BatchItemInput } from './geminiBatchClient.js';
import { directOcrRateLimiter } from './rateLimiter.js';
import { logger } from './logger.js';

interface BatchRunDependencies {
  appscriptClient: AppscriptClient;
  geminiClient: GeminiClient;
  geminiBatchClient: GeminiBatchClient;
  maxImagesPerJob?: number;
}

/**
 * Concurrency runner for parallel execution with controlled concurrency limit.
 */
async function asyncPool<T, R>(
  concurrency: number,
  items: T[],
  iteratorFn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await iteratorFn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

class BatchRunManager {
  private runs: Map<string, BatchRun> = new Map();
  private maxRunHistory = 50;

  public getRun(runId: string): BatchRun | undefined {
    return this.runs.get(runId);
  }

  public getRunForBook(bookName: string): BatchRun | undefined {
    const activeRuns = Array.from(this.runs.values()).filter(
      (r) =>
        r.bookName === bookName &&
        (r.phase === 'preparing' || r.phase === 'downloading' || r.phase === 'uploading'),
    );
    if (activeRuns.length > 0) {
      return activeRuns[activeRuns.length - 1];
    }
    // Return latest run for this book
    const allForBook = Array.from(this.runs.values()).filter((r) => r.bookName === bookName);
    return allForBook[allForBook.length - 1];
  }

  public getAllRuns(): BatchRun[] {
    return Array.from(this.runs.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }

  public isBookRunning(bookName: string): boolean {
    const active = this.getRunForBook(bookName);
    return Boolean(
      active &&
      (active.phase === 'preparing' ||
        active.phase === 'downloading' ||
        active.phase === 'uploading' ||
        active.phase === 'ocr_processing'),
    );
  }

  /**
   * Start a new asynchronous batch or direct run for a book.
   * Immediately returns the BatchRun instance while processing in background.
   */
  public createAndStartRun(
    bookName: string,
    deps: BatchRunDependencies,
    mode: 'batch' | 'direct' = 'batch',
  ): BatchRun {
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const run: BatchRun = {
      runId,
      bookName,
      mode,
      phase: 'preparing',
      totalImages: 0,
      processedImages: 0,
      percent: 0,
      message:
        mode === 'direct'
          ? `Khởi tạo tiến trình OCR trực tiếp (Free Tier) cho cuốn "${bookName}"...`
          : `Khởi tạo tiến trình nạp lô cho cuốn "${bookName}"...`,
      startedAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, run);
    if (this.runs.size > this.maxRunHistory) {
      const oldestKey = this.runs.keys().next().value;
      if (oldestKey) this.runs.delete(oldestKey);
    }

    // Launch execution in background
    this.executeRunInBackground(run, deps).catch((err) => {
      logger.error(`Unhandled error in run ${runId}:`, err);
    });

    return run;
  }

  private async executeRunInBackground(run: BatchRun, deps: BatchRunDependencies): Promise<void> {
    const { appscriptClient, geminiClient, geminiBatchClient } = deps;
    const maxPerJob = deps.maxImagesPerJob || 300;

    try {
      logger.info(
        `[BatchRun ${run.runId}] Starting background processing (${run.mode}) for "${run.bookName}"`,
      );
      run.phase = 'preparing';
      run.message = 'Đang đọc danh sách các trang ở trạng thái Chờ (pending) từ Google Sheet...';
      run.updatedAt = new Date().toISOString();

      const existingRecords = await appscriptClient.readSheetRows();
      const pendingRecords = existingRecords.filter(
        (r) =>
          r.status === 'pending' && (r.bookName || 'Default') === run.bookName && r.driveFileId,
      );

      if (pendingRecords.length === 0) {
        run.phase = 'idle';
        run.message = `Không tìm thấy trang nào ở trạng thái "pending" của cuốn "${run.bookName}".`;
        run.updatedAt = new Date().toISOString();
        logger.warn(`[BatchRun ${run.runId}] No pending pages found for "${run.bookName}".`);
        return;
      }

      run.totalImages = pendingRecords.length;
      run.processedImages = 0;
      const prompt = geminiClient.getPrompt();
      const modelToUse = geminiClient.getModelName();

      // ==========================================
      // MODE 1: Direct Realtime OCR (Free Tier)
      // ==========================================
      if (run.mode === 'direct') {
        run.phase = 'ocr_processing';
        run.message = `Bắt đầu nhận diện OCR trực tiếp cho ${run.totalImages} trang (Free Tier)...`;
        run.updatedAt = new Date().toISOString();

        // Mark rows as 'processing'
        await appscriptClient.batchUpdateRows(
          pendingRecords.map((c) => ({
            identifier: c.driveFileId,
            data: { status: 'processing' },
          })),
        );

        for (let i = 0; i < pendingRecords.length; i++) {
          const item = pendingRecords[i];
          const limiterStatus = directOcrRateLimiter.getStatus();
          if (limiterStatus.isPaused) {
            run.message = `[${i + 1}/${run.totalImages}] Tạm dừng an toàn (Gemini 429 Rate Limit) — Tự động tiếp tục sau ${limiterStatus.pausedRemainingSeconds}s...`;
          } else {
            run.message = `[${i + 1}/${run.totalImages}] Đang tải ảnh và OCR cho "${item.fileName}"...`;
          }
          run.updatedAt = new Date().toISOString();

          try {
            const { base64, mimeType } = await appscriptClient.getImageBase64(item.driveFileId);
            const result = await geminiClient.performOcr(base64, mimeType, prompt, item.fileName);

            await appscriptClient.batchUpdateRows([
              {
                identifier: item.driveFileId,
                data: {
                  status: result.status,
                  ocrText: result.text,
                  note: result.note || '',
                  errorMessage: result.errorMessage || '',
                },
              },
            ]);

            if (result.status === 'done') {
              logger.info(
                `[BatchRun ${run.runId}] OCR done for "${item.fileName}" (${i + 1}/${run.totalImages})` +
                  (result.isBlankPage ? ' [Trang trắng]' : ''),
              );
            } else {
              logger.warn(
                `[BatchRun ${run.runId}] Page "${item.fileName}" completed with status: ${result.status} (${result.errorMessage})`,
              );
            }
          } catch (pageErr: unknown) {
            const pageErrMsg = pageErr instanceof Error ? pageErr.message : String(pageErr);
            logger.error(
              `[BatchRun ${run.runId}] Error OCRing page "${item.fileName}": ${pageErrMsg}`,
            );
            await appscriptClient.batchUpdateRows([
              {
                identifier: item.driveFileId,
                data: {
                  status: 'error',
                  errorMessage: pageErrMsg,
                },
              },
            ]);
          }

          run.processedImages++;
          run.percent = Math.round((run.processedImages / run.totalImages) * 100);
          run.updatedAt = new Date().toISOString();
        }

        run.phase = 'completed';
        run.percent = 100;
        run.message = `Đã hoàn thành nhận diện OCR trực tiếp (Free Tier) cho ${run.processedImages}/${run.totalImages} trang.`;
        run.updatedAt = new Date().toISOString();
        return;
      }

      // ==========================================
      // MODE 2: Gemini Batch API (Paid Tier)
      // ==========================================
      run.phase = 'downloading';
      run.message = `Đang chuẩn bị tải ${run.totalImages} ảnh từ Google Drive (tải song song 4 luồng)...`;
      run.updatedAt = new Date().toISOString();

      // Mark rows as 'batching' in sheet
      await appscriptClient.batchUpdateRows(
        pendingRecords.map((c) => ({
          identifier: c.driveFileId,
          data: { status: 'batching' },
        })),
      );

      // Chunk if larger than maxPerJob
      for (let i = 0; i < pendingRecords.length; i += maxPerJob) {
        const chunk = pendingRecords.slice(i, i + maxPerJob);
        const chunkPartNum = Math.floor(i / maxPerJob) + 1;

        logger.info(
          `[BatchRun ${run.runId}] Downloading ${chunk.length} images for part ${chunkPartNum}...`,
        );

        // Parallel download with concurrency 4
        const batchInputs = await asyncPool<SheetRecord, BatchItemInput>(4, chunk, async (item) => {
          const { base64, mimeType } = await appscriptClient.getImageBase64(item.driveFileId);
          run.processedImages++;
          run.percent = Math.min(85, Math.round((run.processedImages / run.totalImages) * 85));
          run.message = `Đang tải ảnh từ Google Drive: ${run.processedImages} / ${run.totalImages} (${run.percent}%)`;
          run.updatedAt = new Date().toISOString();
          return {
            key: item.driveFileId,
            base64,
            mimeType,
          };
        });

        // Upload to Gemini Batch API
        run.phase = 'uploading';
        run.percent = 90;
        run.message = `Đang đóng gói JSONL và gửi lô lên Gemini Batch API (${chunk.length} ảnh)...`;
        run.updatedAt = new Date().toISOString();
        logger.info(`[BatchRun ${run.runId}] Submitting batch to Gemini (${modelToUse})...`);

        const { batchId } = await geminiBatchClient.submitBatchJob(
          modelToUse,
          batchInputs,
          prompt,
          `${run.bookName}-part-${chunkPartNum}`,
        );

        run.batchId = batchId;

        // Record in batch_jobs sheet
        const jobRecord: BatchJobRecord = {
          batchId,
          bookName: run.bookName,
          submittedAt: new Date().toISOString(),
          status: 'pending',
          lastCheckedAt: new Date().toISOString(),
          totalImages: chunk.length,
        };
        await appscriptClient.appendBatchJob(jobRecord);

        // Update main sheet rows to 'batch_submitted'
        await appscriptClient.batchUpdateRows(
          chunk.map((c) => ({
            identifier: c.driveFileId,
            data: {
              status: 'batch_submitted',
              batchId,
              batchRequestKey: c.driveFileId,
            },
          })),
        );

        logger.info(`[BatchRun ${run.runId}] Successfully submitted ${batchId}`);
      }

      run.phase = 'batch_submitted';
      run.percent = 100;
      run.message = `Đã nạp lô thành công lên Gemini (${run.batchId}) với ${run.totalImages} trang.`;
      run.updatedAt = new Date().toISOString();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[BatchRun ${run.runId}] Failed: ${msg}`);
      run.phase = 'error';
      run.errorMessage = msg;
      run.message = `Gặp lỗi khi xử lý: ${msg}`;
      run.updatedAt = new Date().toISOString();

      try {
        // Rollback sheet rows from 'batching' or 'processing' back to 'pending' so user can retry
        const existingRecords = await appscriptClient.readSheetRows();
        const pendingRollbackRecords = existingRecords.filter(
          (r) =>
            (r.status === 'batching' || r.status === 'processing') &&
            (r.bookName || 'Default') === run.bookName &&
            r.driveFileId,
        );
        if (pendingRollbackRecords.length > 0) {
          await appscriptClient.batchUpdateRows(
            pendingRollbackRecords.map((c) => ({
              identifier: c.driveFileId,
              data: { status: 'pending', errorMessage: '' },
            })),
          );
        }
      } catch (rollbackErr) {
        logger.warn(`[BatchRun ${run.runId}] Could not rollback sheet rows:`, rollbackErr);
      }
    }
  }
}

export const batchRunManager = new BatchRunManager();
