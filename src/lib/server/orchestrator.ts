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
  private activeModel: string = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

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
          id: 'gemini-3.5-flash-lite',
          name: 'Gemini 3.5 Flash Lite',
          displayName: 'Gemini 3.5 Flash Lite (Mặc định)',
        },
        {
          id: 'gemini-3.1-flash-lite',
          name: 'Gemini 3.1 Flash Lite',
          displayName: 'Gemini 3.1 Flash Lite (Fallback 1)',
        },
        {
          id: 'gemini-2.5-flash',
          name: 'Gemini 2.5 Flash',
          displayName: 'Gemini 2.5 Flash (Fallback 2)',
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

    const useBatchMode = process.env.USE_BATCH_MODE?.trim().toLowerCase() === 'true';
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
    useBatchMode: boolean = false,
    batchPollIntervalMinutes: number = 20,
  ) {
    if (this.cronSubmitTask) {
      this.cronSubmitTask.stop();
    }
    if (this.cronPollTask) {
      this.cronPollTask.stop();
    }

    if (useBatchMode) {
      // 1. Submit cron job (quét & gom batch)
      const submitCron = `*/${pollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized for Batch Submit cron: ${submitCron}`);
      this.cronSubmitTask = cron.schedule(submitCron, async () => {
        logger.info('Scheduler triggered batch submission cycle...');
        if (this.syncService) {
          await this.syncService.submitPendingBatches();
        }
      });

      // 2. Poll cron job (kiểm tra trạng thái batch và tải kết quả)
      const pollCron = `*/${batchPollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized for Batch Poll cron: ${pollCron}`);
      this.cronPollTask = cron.schedule(pollCron, async () => {
        logger.info('Scheduler triggered batch polling cycle...');
        if (this.syncService) {
          await this.syncService.pollRunningBatches();
        }
      });
    } else {
      // Direct Realtime cron
      const cronExpr = `*/${pollIntervalMinutes} * * * *`;
      logger.info(`Scheduler initialized with direct sync cron: ${cronExpr}`);
      this.cronSubmitTask = cron.schedule(cronExpr, async () => {
        logger.info('Scheduler triggered direct sync cycle...');
        if (this.syncService) {
          await this.syncService.runSyncCycle();
        }
      });
    }
  }
}

export const orchestrator = new ServiceOrchestrator();
