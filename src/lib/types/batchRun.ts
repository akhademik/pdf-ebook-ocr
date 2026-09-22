export type BatchRunPhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'uploading'
  | 'ocr_processing'
  | 'batch_submitted'
  | 'completed'
  | 'error';

export interface BatchRun {
  runId: string;
  bookName: string;
  mode: 'batch' | 'direct';
  phase: BatchRunPhase;
  totalImages: number;
  processedImages: number;
  percent: number;
  message: string;
  batchId?: string;
  startedAt: string;
  updatedAt: string;
  errorMessage?: string;
}
