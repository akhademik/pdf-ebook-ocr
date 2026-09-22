export type SheetStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DriveFileItem {
  id: string;
  name: string;
  md5Checksum: string;
  createdTime: string;
  mimeType: string;
}

export interface SheetRecord {
  fileName: string;
  status: SheetStatus;
  driveFileId: string;
  ocrText: string;
  errorMessage: string;
  note: string;
  page_order?: number;
  rowIndex?: number;
}

export interface SyncSummary {
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}
