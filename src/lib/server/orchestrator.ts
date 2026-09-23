import cron, { type ScheduledTask } from 'node-cron';
import { loadConfig, getMissingEnvVars } from './config.js';
import { AppscriptClient } from './appscriptClient.js';
import { GeminiClient } from './geminiClient.js';
import { GeminiBatchClient } from './geminiBatchClient.js';
import { SyncService } from './syncService.js';
import { checkSetupSteps } from './setupCheck.js';
import type { SetupCheckResult, GeminiModelInfo } from '$lib/types/config.js';
import type { SheetRecord, BatchJobRecord } from '$lib/types/ocr.js';
import { logger } from './logger.js';

class ServiceOrchestrator {
  private appscriptClient: AppscriptClient | null = null;
  private geminiClient: GeminiClient | null = null;
  private geminiBatchClient: GeminiBatchClient | null = null;
  private syncService: SyncService | null = null;
  private cronSubmitTask: ScheduledTask | null = null;
  private cronPollTask: ScheduledTask | null = null;
  private lastSetupCheck: SetupCheckResult | null = null;
  private activeModel: string = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  private useBatchMode: boolean =
    process.env.USE_BATCH_MODE === undefined || process.env.USE_BATCH_MODE.trim() === ''
      ? true
      : process.env.USE_BATCH_MODE.trim().toLowerCase() !== 'false';

  public getUseBatchMode(): boolean {
    return this.useBatchMode;
  }

  public setUseBatchMode(val: boolean): void {
    this.useBatchMode = Boolean(val);
    logger.info(
      `Switched OCR processing mode to: ${this.useBatchMode ? 'Batch Mode (Paid Tier)' : 'Direct Realtime Mode (Free Tier)'}`,
    );
  }

  public getActiveModel(): string {
    return this.activeModel;
  }

  public setActiveModel(model: string): void {
    this.activeModel = model.trim();
    if (this.geminiClient) {
      this.geminiClient.setModel(this.activeModel);
    }
    logger.info(`Switched active Gemini model to: ${this.activeModel}`);
  }

  public getActivePrompt(): string {
    if (this.geminiClient) {
      return this.geminiClient.getPrompt();
    }
    return '';
  }

  public isCustomPrompt(): boolean {
    if (this.geminiClient) {
      return Boolean(this.geminiClient.getCustomPrompt());
    }
    return false;
  }

  public setActivePrompt(prompt: string): void {
    const client = this.getGeminiClient();
    if (client) {
      client.setPrompt(prompt);
    }
  }

  public async getAvailableFlashModels(): Promise<GeminiModelInfo[]> {
    const client = this.getGeminiClient();
    if (!client) {
      return [
        {
          id: 'gemini-3.6-flash',
          name: 'Gemini 3.6 Flash',
          displayName: 'Gemini 3.6 Flash (Mặc định)',
          description: 'Thế hệ 3.6 Flash khuyến nghị bởi Google AI cho các tính năng mới nhất',
        },
        {
          id: 'gemini-3.7-flash',
          name: 'Gemini 3.7 Flash',
          displayName: 'Gemini 3.7 Flash',
          description: 'Thế hệ 3.7 Flash thế hệ mới với hiệu năng và độ chính xác cao',
        },
        {
          id: 'gemini-3.5-flash',
          name: 'Gemini 3.5 Flash',
          displayName: 'Gemini 3.5 Flash',
          description: 'Thế hệ 3.5 Flash ổn định và tối ưu chi phí',
        },
      ];
    }
    return client.listFlashModels();
  }

  public async getStatus() {
    const missing = getMissingEnvVars();
    const isConfigured = missing.length === 0;

    let records: SheetRecord[] = [];
    let batchJobs: BatchJobRecord[] = [];

    if (isConfigured) {
      const client = this.getAppscriptClient();
      if (client) {
        try {
          records = await client.readSheetRows();
        } catch (err) {
          logger.warn('Could not read sheets records for status:', err);
        }

        try {
          batchJobs = await client.readBatchJobs();
        } catch (err) {
          logger.warn('Could not read batch jobs for status:', err);
        }
      }
    }

    let availableModels: GeminiModelInfo[] = [];
    if (isConfigured) {
      try {
        availableModels = await this.getAvailableFlashModels();
      } catch {
        // use default fallback
      }
    }

    const useBatchMode = this.useBatchMode;
    const batchWaitBeforeSubmitMinutes = parseInt(
      process.env.BATCH_WAIT_BEFORE_SUBMIT_MINUTES || '10',
      10,
    );
    const batchPollIntervalMinutes = parseInt(process.env.BATCH_POLL_INTERVAL_MINUTES || '20', 10);
    const batchMaxImagesPerJob = parseInt(process.env.BATCH_MAX_IMAGES_PER_JOB || '300', 10);

    return {
      isConfigured,
      missingEnv: missing,
      pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '5', 10),
      maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '3', 10),
      outputDir: process.env.OUTPUT_DIR || './output',
      geminiModel: this.activeModel,
      availableModels,
      driveFolderId: process.env.DRIVE_FOLDER_ID || '',
      appscriptWebAppUrl: process.env.APPSCRIPT_WEB_APP_URL || '',
      hasAppscriptSecret: Boolean(process.env.APPSCRIPT_SECRET),
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      useBatchMode,
      batchWaitBeforeSubmitMinutes,
      batchPollIntervalMinutes,
      batchMaxImagesPerJob,
      isSyncing: this.syncService ? this.syncService.isBusy() : false,
      lastSyncSummary: this.syncService ? this.syncService.getLastSummary() : null,
      lastSyncTime: this.syncService ? this.syncService.getLastSyncTime() : null,
      lastSetupCheck: this.lastSetupCheck,
      records,
      batchJobs,
      recentLogs: logger.getRecentLogs(),
    };
  }

  public async runSetupCheck(): Promise<SetupCheckResult> {
    const missing = getMissingEnvVars();
    if (missing.length > 0) {
      this.lastSetupCheck = {
        success: false,
        steps: [
          {
            name: 'env',
            title: 'Environment Variables',
            status: 'error',
            message: `Thiếu biến môi trường: ${missing.join(', ')}`,
          },
        ],
      };
      return this.lastSetupCheck;
    }

    const config = loadConfig();
    config.geminiModel = this.activeModel;

    const result = await checkSetupSteps(config);
    this.lastSetupCheck = result;

    if (result.success) {
      this.appscriptClient = new AppscriptClient(config.appscriptWebAppUrl, config.appscriptSecret);
      this.geminiClient = new GeminiClient(config.geminiApiKey, this.activeModel);
      this.geminiBatchClient = new GeminiBatchClient(config.geminiApiKey);
      this.syncService = new SyncService(
        config,
        this.appscriptClient,
        this.geminiClient,
        this.geminiBatchClient,
      );

      this.initScheduler(
        config.pollIntervalMinutes,
        config.useBatchMode,
        config.batchPollIntervalMinutes,
      );
    }

    return result;
  }

  public getSyncService(): SyncService | null {
    if (!this.syncService) {
      try {
        const config = loadConfig();
        this.appscriptClient = new AppscriptClient(
          config.appscriptWebAppUrl,
          config.appscriptSecret,
        );
        this.geminiClient = new GeminiClient(config.geminiApiKey, this.activeModel);
        this.geminiBatchClient = new GeminiBatchClient(config.geminiApiKey);
        this.syncService = new SyncService(
          config,
          this.appscriptClient,
          this.geminiClient,
          this.geminiBatchClient,
        );
      } catch (err) {
        logger.warn('Cannot instantiate sync service:', err);
      }
    }
    return this.syncService;
  }

  public getAppscriptClient(): AppscriptClient | null {
    if (!this.appscriptClient) {
      try {
        const config = loadConfig();
        this.appscriptClient = new AppscriptClient(
          config.appscriptWebAppUrl,
          config.appscriptSecret,
        );
      } catch {
        return null;
      }
    }
    return this.appscriptClient;
  }

  public getGeminiClient(): GeminiClient | null {
    if (!this.geminiClient) {
      try {
        const config = loadConfig();
        this.geminiClient = new GeminiClient(config.geminiApiKey, this.activeModel);
      } catch {
        return null;
      }
    }
    return this.geminiClient;
  }

  public getGeminiBatchClient(): GeminiBatchClient | null {
    if (!this.geminiBatchClient) {
      try {
        const config = loadConfig();
        this.geminiBatchClient = new GeminiBatchClient(config.geminiApiKey);
      } catch {
        return null;
      }
    }
    return this.geminiBatchClient;
  }

  public initScheduler(
    pollIntervalMinutes: number,
    useBatchMode: boolean = true,
    batchPollIntervalMinutes: number = 20,
  ) {
    if (this.cronSubmitTask) {
      this.cronSubmitTask.stop();
    }
    if (this.cronPollTask) {
      this.cronPollTask.stop();
    }

    if (useBatchMode) {
      // 1. Discovery cron job (chỉ quét Drive và nạp file mới vào Sheet dạng pending, KHÔNG tự động OCR)
      const discoverCron = `*/${pollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized for Drive Discovery cron: ${discoverCron}`);
      this.cronSubmitTask = cron.schedule(discoverCron, async () => {
        logger.info('Scheduler triggered Drive discovery cycle (finding new pending images)...');
        if (this.syncService) {
          await this.syncService.discoverAndSyncSheet();
        }
      });

      // 2. Poll cron job (kiểm tra trạng thái batch đã gửi và cập nhật kết quả)
      const pollCron = `*/${batchPollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized for Batch Poll cron: ${pollCron}`);
      this.cronPollTask = cron.schedule(pollCron, async () => {
        logger.info('Scheduler triggered batch polling cycle...');
        if (this.syncService) {
          await this.syncService.pollRunningBatches();
        }
      });
    } else {
      // Direct Realtime cron (chỉ quét nạp pending)
      const cronExpr = `*/${pollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized with Drive discovery cron: ${cronExpr}`);
      this.cronSubmitTask = cron.schedule(cronExpr, async () => {
        logger.info('Scheduler triggered Drive discovery cycle...');
        if (this.syncService) {
          await this.syncService.discoverAndSyncSheet();
        }
      });
    }
  }
}

export const orchestrator = new ServiceOrchestrator();
