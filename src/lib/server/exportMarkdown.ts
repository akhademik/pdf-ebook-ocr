import fs from 'fs/promises';
import path from 'path';
import type { SheetRecord } from '$lib/types/ocr.js';
import { extractPageOrder } from '$lib/utils/pageOrderExtractor.js';
import { logger } from './logger.js';

/**
 * Export all done OCR records to page{page_order}.md files.
 */
export async function exportMarkdownFiles(
  records: SheetRecord[],
  outputDir: string,
  customRegex?: RegExp,
): Promise<number> {
  const doneRecords = records.filter((r) => r.status === 'done' && r.ocrText);

  if (doneRecords.length === 0) {
    logger.info('No done OCR records to export.');
    return 0;
  }

  await fs.mkdir(outputDir, { recursive: true });

  // Map each record with a numeric page order
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

  let exportedCount = 0;
  for (const rec of mapped) {
    const fileName = `page${rec.pageOrder}.md`;
    const filePath = path.join(outputDir, fileName);

    await fs.writeFile(filePath, rec.ocrText, 'utf-8');
    exportedCount++;
  }

  logger.info(`Exported ${exportedCount} markdown page(s) to "${outputDir}".`);
  return exportedCount;
}
