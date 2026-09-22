import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchRunManager } from '$lib/server/batchRunManager.js';
import type { AppscriptClient } from '$lib/server/appscriptClient.js';
import type { GeminiClient } from '$lib/server/geminiClient.js';
import type { GeminiBatchClient } from '$lib/server/geminiBatchClient.js';
import type { SheetRecord } from '$lib/types/ocr.js';

describe('BatchRunManager', () => {
  let mockAppscript: Partial<AppscriptClient>;
  let mockGemini: Partial<GeminiClient>;
  let mockGeminiBatch: Partial<GeminiBatchClient>;

  beforeEach(() => {
    mockAppscript = {
      readSheetRows: vi.fn().mockResolvedValue([
        {
          fileName: '001.jpg',
          driveFileId: 'f1',
          status: 'pending',
          bookName: 'Book1',
          ocrText: '',
          errorMessage: '',
          note: '',
        } as SheetRecord,
        {
          fileName: '002.jpg',
          driveFileId: 'f2',
          status: 'pending',
          bookName: 'Book1',
          ocrText: '',
          errorMessage: '',
          note: '',
        } as SheetRecord,
      ]),
      batchUpdateRows: vi.fn().mockResolvedValue({ success: true, updatedCount: 2 }),
      getImageBase64: vi.fn().mockResolvedValue({
        base64: 'fakebase64',
        mimeType: 'image/jpeg',
        fileName: 'test.jpg',
      }),
      appendBatchJob: vi.fn().mockResolvedValue({ success: true }),
    };

    mockGemini = {
      getPrompt: vi.fn().mockReturnValue('OCR prompt'),
      getModelName: vi.fn().mockReturnValue('gemini-3.5-flash-lite'),
    };

    mockGeminiBatch = {
      submitBatchJob: vi.fn().mockResolvedValue({ batchId: 'batches/test-run-123' }),
    };
  });

  it('should create run, return 202-like object immediately, and complete background job', async () => {
    const run = batchRunManager.createAndStartRun('Book1', {
      appscriptClient: mockAppscript as AppscriptClient,
      geminiClient: mockGemini as GeminiClient,
      geminiBatchClient: mockGeminiBatch as GeminiBatchClient,
      maxImagesPerJob: 100,
    });

    expect(run).toBeDefined();
    expect(run.bookName).toBe('Book1');
    expect(run.runId).toMatch(/^run_/);

    // Wait for background promise execution to finish
    await new Promise((resolve) => setTimeout(resolve, 50));

    const finalRun = batchRunManager.getRun(run.runId);
    expect(finalRun).toBeDefined();
    expect(finalRun?.phase).toBe('batch_submitted');
    expect(finalRun?.totalImages).toBe(2);
    expect(finalRun?.processedImages).toBe(2);
    expect(finalRun?.percent).toBe(100);
    expect(finalRun?.batchId).toBe('batches/test-run-123');

    expect(mockAppscript.getImageBase64).toHaveBeenCalledTimes(2);
    expect(mockGeminiBatch.submitBatchJob).toHaveBeenCalled();
    expect(mockAppscript.appendBatchJob).toHaveBeenCalled();
  });

  it('should handle no pending images gracefully', async () => {
    (mockAppscript.readSheetRows as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const run = batchRunManager.createAndStartRun('EmptyBook', {
      appscriptClient: mockAppscript as AppscriptClient,
      geminiClient: mockGemini as GeminiClient,
      geminiBatchClient: mockGeminiBatch as GeminiBatchClient,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));

    const finalRun = batchRunManager.getRun(run.runId);
    expect(finalRun?.phase).toBe('idle');
  });
});
