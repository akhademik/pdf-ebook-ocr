import type { SheetRecord, SyncSummary } from './ocr.js';
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
  isSyncing: boolean;
  lastSyncSummary: SyncSummary | null;
  lastSyncTime: string | null;
  lastSetupCheck: SetupCheckResult | null;
  records: SheetRecord[];
  recentLogs: string[];
}
