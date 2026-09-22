import JSZip from 'jszip';
import type { SheetRecord } from '$lib/types/ocr.js';
import { extractPageOrder } from '$lib/utils/pageOrderExtractor.js';
import { logger } from './logger.js';

export interface ZipExportResult {
  buffer: Uint8Array;
  count: number;
  fileName: string;
}

/**
 * Generate a ZIP file in memory containing all done OCR records as pageN.md files.
 * If multiple books exist, files are organized into book folders.
 */
export async function generateMarkdownZip(
  records: SheetRecord[],
  targetBookName?: string,
  customRegex?: RegExp,
): Promise<ZipExportResult> {
  let doneRecords = records.filter((r) => r.status === 'done' && r.ocrText);

  if (targetBookName && targetBookName !== 'all') {
    doneRecords = doneRecords.filter((r) => (r.bookName || 'Default') === targetBookName);
  }

  const zip = new JSZip();

  if (doneRecords.length === 0) {
    logger.info('No done OCR records found to zip.');
    const emptyZip = await zip.generateAsync({ type: 'uint8array' });
    return {
      buffer: emptyZip,
      count: 0,
      fileName: 'ocr-markdown-empty.zip',
    };
  }

  // Detect unique books
  const distinctBooks = [...new Set(doneRecords.map((r) => r.bookName || 'Default'))];
  const hasMultipleBooks = distinctBooks.length > 1;

  // Map each record with numeric page order
  const mapped = doneRecords.map((rec) => {
    const pageOrder =
      rec.page_order !== undefined
        ? rec.page_order
        : extractPageOrder(rec.fileName, new Date().toISOString(), customRegex);
    return {
      ...rec,
      pageOrder,
    };
  });

  mapped.sort((a, b) => a.pageOrder - b.pageOrder);

  // Add each file to the zip archive
  for (const rec of mapped) {
    const bookFolder = rec.bookName && rec.bookName !== 'Default' ? rec.bookName : '';
    const filePath =
      hasMultipleBooks && bookFolder
        ? `${bookFolder}/page${rec.pageOrder}.md`
        : `page${rec.pageOrder}.md`;

    zip.file(filePath, rec.ocrText);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix =
    targetBookName && targetBookName !== 'all' ? `ocr-${targetBookName}` : 'ocr-markdown-pages';
  const zipFileName = `${prefix}-${timestamp}.zip`;

  logger.info(
    `Generated ZIP archive containing ${mapped.length} markdown page(s) across ${distinctBooks.length} book(s).`,
  );

  return {
    buffer: zipBuffer,
    count: mapped.length,
    fileName: zipFileName,
  };
}
