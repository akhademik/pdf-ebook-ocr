import type { DriveFileItem, SheetRecord, BatchJobRecord } from '$lib/types/ocr.js';
import { logger } from './logger.js';

export class AppscriptClient {
  private webAppUrl: string;
  private secretToken: string;

  constructor(webAppUrl: string, secretToken: string) {
    this.webAppUrl = webAppUrl.trim();
    this.secretToken = secretToken.trim();
  }

  /**
   * Send an action payload to the Google Apps Script Web App.
   */
  private async callAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    const body = {
      token: this.secretToken,
      action,
      ...payload,
    };

    let response: Response;
    try {
      response = await fetch(this.webAppUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(body),
        redirect: 'follow',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Network error calling Apps Script [${action}]: ${msg}`);
      throw new Error(`Không thể kết nối đến Google Apps Script Web App: ${msg}`);
    }

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.error || JSON.stringify(errorJson);
      } catch {
        errorDetail = await response.text();
      }

      if (response.status === 403) {
        throw new Error(
          `403 Unauthorized: Token không khớp với SECRET_TOKEN trong Apps Script Script Properties (${errorDetail})`,
        );
      }
      throw new Error(`Apps Script HTTP Error (${response.status}): ${errorDetail}`);
    }

    const json = (await response.json()) as { error?: string } & T;
    if (json.error) {
      throw new Error(`Apps Script Error: ${json.error}`);
    }

    return json;
  }

  /**
   * Verify Apps Script connection and ensure Sheet headers exist.
   */
  async ensureHeader(): Promise<{ success: boolean; message: string }> {
    return this.callAction<{ success: boolean; message: string }>('ensureHeader');
  }

  /**
   * List all image files in the Google Drive folder (including subfolders as books).
   */
  async listImages(folderId: string): Promise<{ folderName: string; files: DriveFileItem[] }> {
    return this.callAction<{ folderName: string; files: DriveFileItem[] }>('listImages', {
      folderId,
    });
  }

  /**
   * Download a file from Drive as base64 string.
   */
  async getImageBase64(
    fileId: string,
  ): Promise<{ base64: string; mimeType: string; fileName: string }> {
    return this.callAction<{ base64: string; mimeType: string; fileName: string }>(
      'getImageBase64',
      { fileId },
    );
  }

  /**
   * Read all data rows from the Google Sheet.
   */
  async readSheetRows(): Promise<SheetRecord[]> {
    const res = await this.callAction<{ success: boolean; records: SheetRecord[] }>(
      'readSheetRows',
    );
    return res.records || [];
  }

  /**
   * Append a single row to the Google Sheet.
   */
  async appendRow(record: SheetRecord): Promise<{ success: boolean; rowIndex: number }> {
    return this.callAction<{ success: boolean; rowIndex: number }>('appendRow', {
      data: record,
    });
  }

  /**
   * Update row by driveFileId or hash.
   */
  async updateRow(
    driveFileId: string,
    updateFields: Partial<SheetRecord>,
  ): Promise<{ success: boolean; rowIndex?: number }> {
    return this.callAction<{ success: boolean; rowIndex?: number }>('updateRow', {
      driveFileId,
      data: updateFields,
    });
  }

  /**
   * Batch update multiple rows at once.
   */
  async batchUpdateRows(
    updates: { identifier: string; data: Partial<SheetRecord> }[],
  ): Promise<{ success: boolean; updatedCount: number }> {
    return this.callAction<{ success: boolean; updatedCount: number }>('batchUpdateRows', {
      updates,
    });
  }

  /**
   * Update all rows matching a batchId.
   */
  async updateRowsByBatchId(
    batchId: string,
    updateFields: Partial<SheetRecord>,
  ): Promise<{ success: boolean; updatedCount: number }> {
    return this.callAction<{ success: boolean; updatedCount: number }>('updateRowsByBatchId', {
      batchId,
      data: updateFields,
    });
  }

  /**
   * Delete all rows belonging to a book from Sheet 1 and batch_jobs.
   */
  async deleteBookRows(
    bookName: string,
  ): Promise<{ success: boolean; deletedCount: number; bookName: string }> {
    return this.callAction<{ success: boolean; deletedCount: number; bookName: string }>(
      'deleteBookRows',
      {
        bookName,
      },
    );
  }

  /**
   * Read all batch job records from sheet "batch_jobs".
   */
  async readBatchJobs(): Promise<BatchJobRecord[]> {
    const res = await this.callAction<{ success: boolean; records: BatchJobRecord[] }>(
      'readBatchJobs',
    );
    return res.records || [];
  }

  /**
   * Append a batch job record to sheet "batch_jobs".
   */
  async appendBatchJob(job: BatchJobRecord): Promise<{ success: boolean; rowIndex: number }> {
    return this.callAction<{ success: boolean; rowIndex: number }>('appendBatchJob', {
      data: job,
    });
  }

  /**
   * Update a batch job record on sheet "batch_jobs".
   */
  async updateBatchJob(
    batchId: string,
    updateFields: Partial<BatchJobRecord>,
  ): Promise<{ success: boolean; rowIndex?: number }> {
    return this.callAction<{ success: boolean; rowIndex?: number }>('updateBatchJob', {
      batchId,
      data: updateFields,
    });
  }
}
