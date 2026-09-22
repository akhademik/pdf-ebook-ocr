import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { SyncService } from '../src/lib/server/syncService.js';
import type { AppConfig } from '../src/lib/types/config.js';
import type { SheetRecord } from '../src/lib/types/ocr.js';

describe('syncService (Custom Sheet Schema)', () => {
  const testOutputDir = './tests/temp_output_sync';
  const mockConfig: AppConfig = {
    appscriptWebAppUrl: 'https://script.google.com/macros/s/test/exec',
    appscriptSecret: 'secret123',
    driveFolderId: 'folder123',
    geminiApiKey: 'test_key',
    geminiModel: 'gemini-1.5-flash',
    pollIntervalMinutes: 5,
    maxConcurrency: 2,
    outputDir: testOutputDir,
  };

  let mockAppscriptClient: any;
  let mockGeminiClient: any;
  let sheetDb: SheetRecord[];

  beforeEach(async () => {
    await fs.rm(testOutputDir, { recursive: true, force: true });
    sheetDb = [];

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
      updateRow: vi.fn().mockImplementation(async (driveFileId: string, patch: any) => {
        const index = sheetDb.findIndex((r) => r.driveFileId === driveFileId);
        if (index !== -1) {
          sheetDb[index] = { ...sheetDb[index], ...patch };
          return { success: true };
        }
        return { success: false, error: 'not found' };
      }),
      getImageBase64: vi.fn().mockResolvedValue({
        base64: 'fake-image-base64',
        mimeType: 'image/jpeg',
        fileName: '001_scan.jpg',
      }),
    };

    mockGeminiClient = {
      performOcr: vi.fn().mockResolvedValue('Extracted Text from Page 1'),
    };
  });

  afterEach(async () => {
    await fs.rm(testOutputDir, { recursive: true, force: true });
  });

  it('should process pending file via Apps Script, call OCR, update sheet to done and export markdown', async () => {
    const service = new SyncService(mockConfig, mockAppscriptClient, mockGeminiClient);

    const summary = await service.runSyncCycle();
    expect(summary.discovered).toBe(1);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(0);

    expect(sheetDb.length).toBe(1);
    expect(sheetDb[0].status).toBe('done');
    expect(sheetDb[0].ocrText).toBe('Extracted Text from Page 1');
  });

  it('should skip already done records on subsequent cycles', async () => {
    sheetDb = [
      {
        fileName: '001_scan.jpg',
        status: 'done',
        driveFileId: 'file1',
        ocrText: 'Already done',
        errorMessage: '',
        note: 'hash1',
        rowIndex: 2,
      },
    ];

    const service = new SyncService(mockConfig, mockAppscriptClient, mockGeminiClient);

    const summary = await service.runSyncCycle();
    expect(summary.discovered).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(mockGeminiClient.performOcr).not.toHaveBeenCalled();
  });
});
