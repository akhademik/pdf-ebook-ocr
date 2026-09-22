import cron from 'node-cron';
import { loadConfig } from '$lib/server/config.js';
import { runSetupCheck } from '$lib/server/setupCheck.js';
import { SyncService } from '$lib/server/syncService.js';
import { logger } from '$lib/server/logger.js';

async function main() {
  logger.info('Starting Docker OCR (CLI Standalone Mode - Apps Script Bridge)...');

  const config = loadConfig();
  const { appscriptClient, geminiClient } = await runSetupCheck(config);
  const syncService = new SyncService(config, appscriptClient, geminiClient);

  logger.info('Executing initial sync cycle...');
  await syncService.runSyncCycle();

  const cronExpression = `*/${config.pollIntervalMinutes} * * * *`;
  logger.info(`Scheduled sync every ${config.pollIntervalMinutes} min(s) [${cronExpression}]`);

  const task = cron.schedule(cronExpression, async () => {
    logger.info('Cron schedule triggered.');
    await syncService.runSyncCycle();
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully stopping...`);
    task.stop();
    const maxWait = 30000;
    const startWait = Date.now();
    while (syncService.isBusy() && Date.now() - startWait < maxWait) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal CLI Error:', err);
  process.exit(1);
});
