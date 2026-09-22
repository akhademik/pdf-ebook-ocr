export type BatchRunPhase =
  'idle' | 'preparing' | 'downloading' | 'uploading' | 'batch_submitted' | 'error';

export interface BatchRun {
  runId: string;
  bookName: string;
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
