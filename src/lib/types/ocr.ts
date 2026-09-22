export type SheetStatus =
  'pending' | 'batching' | 'batch_submitted' | 'batch_processing' | 'processing' | 'done' | 'error';

export type BatchJobStatus =
  'pending' | 'running' | 'completed' | 'partially_completed' | 'failed' | 'expired';

export interface DriveFileItem {
  id: string;
  name: string;
  md5Checksum: string;
  createdTime: string;
  mimeType: string;
  bookName?: string;
}

export interface SheetRecord {
  fileName: string;
  status: SheetStatus;
  driveFileId: string;
  ocrText: string;
  errorMessage: string;
  note: string;
  bookName?: string;
  batchId?: string;
  batchRequestKey?: string;
  page_order?: number;
  rowIndex?: number;
}

export interface BatchJobRecord {
  batchId: string;
  bookName: string;
  submittedAt: string;
  status: BatchJobStatus;
  lastCheckedAt: string;
  totalImages: number;
  errorMessage?: string;
  rowIndex?: number;
}

export interface SyncSummary {
  discovered: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}
