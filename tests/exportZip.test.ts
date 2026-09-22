import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generateMarkdownZip } from '../src/lib/server/exportZip.js';
import type { SheetRecord } from '../src/lib/types/ocr.js';

describe('exportZip', () => {
  it('should generate a valid zip file containing page1.md and page2.md in numerical order', async () => {
    const mockRecords: SheetRecord[] = [
      {
        fileName: 'page_02.jpg',
        status: 'done',
        driveFileId: 'id2',
        ocrText: 'Nội dung trang 2',
        errorMessage: '',
        note: '',
      },
      {
        fileName: 'page_01.jpg',
        status: 'done',
        driveFileId: 'id1',
        ocrText: 'Nội dung trang 1',
        errorMessage: '',
        note: '',
      },
      {
        fileName: 'page_03.jpg',
        status: 'pending',
        driveFileId: 'id3',
        ocrText: '',
        errorMessage: '',
        note: '',
      },
    ];

    const result = await generateMarkdownZip(mockRecords);
    expect(result.count).toBe(2);
    expect(result.fileName).toMatch(/^ocr-markdown-pages-.*\.zip$/);
    expect(result.buffer).toBeInstanceOf(Uint8Array);

    const loadedZip = await JSZip.loadAsync(result.buffer);
    const files = Object.keys(loadedZip.files);
    expect(files).toContain('page1.md');
    expect(files).toContain('page2.md');
    expect(files).not.toContain('page3.md');

    const page1Content = await loadedZip.file('page1.md')?.async('text');
    expect(page1Content).toBe('Nội dung trang 1');

    const page2Content = await loadedZip.file('page2.md')?.async('text');
    expect(page2Content).toBe('Nội dung trang 2');
  });

  it('should handle empty records list gracefully', async () => {
    const result = await generateMarkdownZip([]);
    expect(result.count).toBe(0);
    expect(result.fileName).toBe('ocr-markdown-empty.zip');
    expect(result.buffer).toBeInstanceOf(Uint8Array);
  });
});
