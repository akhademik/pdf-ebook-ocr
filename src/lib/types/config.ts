export interface GeminiModelInfo {
  id: string;
  name: string;
  displayName: string;
  description?: string;
}

export interface AppConfig {
  appscriptWebAppUrl: string;
  appscriptSecret: string;
  driveFolderId: string;
  geminiApiKey: string;
  geminiModel: string;
  pollIntervalMinutes: number;
  maxConcurrency: number;
  outputDir: string;
  pageOrderRegex?: RegExp;
  useBatchMode: boolean;
  batchWaitBeforeSubmitMinutes: number;
  batchPollIntervalMinutes: number;
  batchMaxImagesPerJob: number;
  directOcrTargetRpm?: number;
}

export interface SetupCheckStep {
  name: string;
  title: string;
  status: 'pending' | 'success' | 'error' | 'running';
  message: string;
  details?: string;
}

export interface SetupCheckResult {
  success: boolean;
  steps: SetupCheckStep[];
  driveFolderName?: string;
  availableModels?: GeminiModelInfo[];
}
