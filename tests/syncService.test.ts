import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { SyncService } from '../src/lib/server/syncService.js';
import type { AppConfig } from '../src/lib/types/config.js';
import type { SheetRecord, BatchJobRecord } from '../src/lib/types/ocr.js';

describe('syncService (Custom Sheet Schema & Batch Mode)', () => {
  const testOutputDir = './tests/temp_output_sync';
  const mockConfig: AppConfig = {
    appscriptWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    appscriptSecret: 'secret123',
    driveFolderId: 'folder123',
    geminiApiKey: 'test_key',
    geminiModel: 'gemini-3.5-flash-lite',
    pollIntervalMinutes: 5,
    maxConcurrency: 2,
    outputDir: testOutputDir,
    useBatchMode: false,
    batchWaitBeforeSubmitMinutes: 10,
    batchPollIntervalMinutes: 20,
    batchMaxImagesPerJob: 300,
  };

  let mockAppscriptClient: any;
  let mockGeminiClient: any;
  let mockGeminiBatchClient: any;
  let sheetDb: SheetRecord[];
  let batchJobsDb: BatchJobRecord[];

  beforeEach(async () => {
    await fs.rm(testOutputDir, { recursive: true, force: true });
    sheetDb = [];
    batchJobsDb = [];

    mockAppscriptClient = {
      listImages: vi.fn().mockResolvedValue({
        success: true,
        folderName: 'Test Folder',
        files: [
          {
            id: 'file1',
            name: '001_scan.jpg',
            md5Checksum: 'hash1',
            createdTime: '2026-01-01T00:00:00Z',
            mimeType: 'image/jpeg',
            bookName: 'BookA',
          },
        ],
      }),
      readSheetRows: vi.fn().mockImplementation(async () => {
        return sheetDb.map((r, i) => ({ ...r, rowIndex: i + 2 }));
      }),
      appendRow: vi.fn().mockImplementation(async (record: SheetRecord) => {
        sheetDb.push(record);
        return { success: true, rowIndex: sheetDb.length + 1 };
      }),
      appendRows: vi.fn().mockImplementation(async (records: SheetRecord[]) => {
        sheetDb.push(...records);
        return {
          success: true,
          count: records.length,
          startRow: sheetDb.length - records.length + 2,
        };
      }),
      updateRow: vi.fn().mockImplementation(async (driveFileId: string, patch: any) => {
        const index = sheetDb.findIndex((r) => r.driveFileId === driveFileId);
        if (index !== -1) {
          sheetDb[index] = { ...sheetDb[index], ...patch };
          return { success: true };
        }
        return { success: false, error: 'not found' };
      }),
      batchUpdateRows: vi.fn().mockImplementation(async (updates: any[]) => {
        for (const u of updates) {
          const index = sheetDb.findIndex((r) => r.driveFileId === u.identifier);
          if (index !== -1) {
            sheetDb[index] = { ...sheetDb[index], ...u.data };
          }
        }
        return { success: true, updatedCount: updates.length };
      }),
      updateRowsByBatchId: vi.fn().mockImplementation(async (batchId: string, patch: any) => {
        for (const row of sheetDb) {
          if (row.batchId === batchId) {
            Object.assign(row, patch);
          }
        }
        return { success: true, updatedCount: 1 };
      }),
      getImageBase64: vi.fn().mockResolvedValue({
        base64: 'fake-image-base64',
        mimeType: 'image/jpeg',
        fileName: '001_scan.jpg',
      }),
      readBatchJobs: vi.fn().mockImplementation(async () => {
        return batchJobsDb;
      }),
      appendBatchJob: vi.fn().mockImplementation(async (job: BatchJobRecord) => {
        batchJobsDb.push(job);
        return { success: true, rowIndex: batchJobsDb.length + 1 };
      }),
      updateBatchJob: vi.fn().mockImplementation(async (batchId: string, patch: any) => {
        const index = batchJobsDb.findIndex((j) => j.batchId === batchId);
        if (index !== -1) {
          batchJobsDb[index] = { ...batchJobsDb[index], ...patch };
          return { success: true };
        }
        return { success: false, error: 'not found' };
      }),
    };

    mockGeminiClient = {
      performOcr: vi.fn().mockResolvedValue('Extracted Text from Page 1'),
      getPrompt: vi.fn().mockReturnValue('Default Prompt'),
      getModelName: vi.fn().mockReturnValue('gemini-3.5-flash-lite'),
    };

    mockGeminiBatchClient = {
      submitBatchJob: vi.fn().mockResolvedValue({
        batchId: 'batches/job-123',
        totalImages: 1,
      }),
      checkBatchStatus: vi.fn().mockResolvedValue({
        batchId: 'batches/job-123',
        state: 'completed',
        outputUri: 'files/result123',
      }),
      fetchBatchResults: vi
        .fn()
        .mockResolvedValue(new Map([['file1', { key: 'file1', ocrText: 'Batch Extracted Text' }]])),
    };
  });

  afterEach(async () => {
    await fs.rm(testOutputDir, { recursive: true, force: true });
  });

  it('should process pending file via Apps Script in Direct Realtime mode', async () => {
    const service = new SyncService(
      mockConfig,
      mockAppscriptClient,
      mockGeminiClient,
      mockGeminiBatchClient,
    );

    const summary = await service.runSyncCycle();
    expect(summary.discovered).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(0);

    expect(sheetDb.length).toBe(1);
    expect(sheetDb[0].status).toBe('done');
    expect(sheetDb[0].ocrText).toBe('Extracted Text from Page 1');
  });

  it('should submit batches grouped by book in Batch Mode', async () => {
    const batchConfig: AppConfig = { ...mockConfig, useBatchMode: true };
    const service = new SyncService(
      batchConfig,
      mockAppscriptClient,
      mockGeminiClient,
      mockGeminiBatchClient,
    );

    const summary = await service.submitPendingBatches();
    expect(summary.discovered).toBe(1);
    expect(summary.succeeded).toBe(1);

    expect(mockGeminiBatchClient.submitBatchJob).toHaveBeenCalled();
    expect(batchJobsDb.length).toBe(1);
    expect(batchJobsDb[0].batchId).toBe('batches/job-123');
    expect(batchJobsDb[0].bookName).toBe('BookA');

    expect(sheetDb[0].status).toBe('batch_submitted');
    expect(sheetDb[0].batchId).toBe('batches/job-123');
  });

  it('should poll running batches and update results when completed', async () => {
    batchJobsDb = [
      {
        batchId: 'batches/job-123',
        bookName: 'BookA',
        submittedAt: new Date().toISOString(),
        status: 'pending',
        lastCheckedAt: new Date().toISOString(),
        totalImages: 1,
      },
    ];

    sheetDb = [
      {
        fileName: '001_scan.jpg',
        status: 'batch_submitted',
        driveFileId: 'file1',
        ocrText: '',
        errorMessage: '',
        note: '',
        bookName: 'BookA',
        batchId: 'batches/job-123',
        batchRequestKey: 'file1',
      },
    ];

    const batchConfig: AppConfig = { ...mockConfig, useBatchMode: true };
    const service = new SyncService(
      batchConfig,
      mockAppscriptClient,
      mockGeminiClient,
      mockGeminiBatchClient,
    );

    const pollStats = await service.pollRunningBatches();
    expect(pollStats.polled).toBe(1);
    expect(pollStats.completed).toBe(1);

    expect(batchJobsDb[0].status).toBe('completed');
    expect(sheetDb[0].status).toBe('done');
    expect(sheetDb[0].ocrText).toBe('Batch Extracted Text');
  });
});
