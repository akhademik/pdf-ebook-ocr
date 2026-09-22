import type { SheetRecord, SyncSummary, BatchJobRecord } from './ocr.js';
import type { SetupCheckResult, GeminiModelInfo } from './config.js';

export interface SystemStatusResponse {
  isConfigured: boolean;
  missingEnv: string[];
  pollIntervalMinutes: number;
  maxConcurrency: number;
  outputDir: string;
  geminiModel: string;
  availableModels: GeminiModelInfo[];
  driveFolderId: string;
  appscriptWebAppUrl: string;
  hasAppscriptSecret: boolean;
  hasGeminiKey: boolean;
  useBatchMode: boolean;
  batchWaitBeforeSubmitMinutes: number;
  batchPollIntervalMinutes: number;
  batchMaxImagesPerJob: number;
  isSyncing: boolean;
  lastSyncSummary: SyncSummary | null;
  lastSyncTime: string | null;
  lastSetupCheck: SetupCheckResult | null;
  records: SheetRecord[];
  batchJobs: BatchJobRecord[];
  recentLogs: string[];
}
