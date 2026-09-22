import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { exportMarkdownFiles } from '../src/lib/server/exportMarkdown.js';
import type { SheetRecord } from '../src/lib/types/ocr.js';

const TEST_OUTPUT_DIR = path.join(process.cwd(), 'tests', 'temp_output');

describe('exportMarkdown', () => {
  beforeEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
  });

  it('should export done records to individual pageN.md files sorted by page_order', async () => {
    const sampleRecords: SheetRecord[] = [
      {
        fileName: 'page2.jpg',
        status: 'done',
        driveFileId: 'id2',
        ocrText: 'Content of Page 2',
        errorMessage: '',
        note: 'hash2',
      },
      {
        fileName: 'page1.jpg',
        status: 'done',
        driveFileId: 'id1',
        ocrText: 'Content of Page 1',
        errorMessage: '',
        note: 'hash1',
      },
      {
        fileName: 'page3.jpg',
        status: 'pending',
        driveFileId: 'id3',
        ocrText: '',
        errorMessage: '',
        note: 'hash3',
      },
    ];

    const exportedCount = await exportMarkdownFiles(sampleRecords, TEST_OUTPUT_DIR);
    expect(exportedCount).toBe(2);

    const page1 = await fs.readFile(path.join(TEST_OUTPUT_DIR, 'page1.md'), 'utf-8');
    const page2 = await fs.readFile(path.join(TEST_OUTPUT_DIR, 'page2.md'), 'utf-8');

    expect(page1).toBe('Content of Page 1');
    expect(page2).toBe('Content of Page 2');
  });

  it('should return 0 when no done records exist', async () => {
    const count = await exportMarkdownFiles([], TEST_OUTPUT_DIR);
    expect(count).toBe(0);
  });
});
