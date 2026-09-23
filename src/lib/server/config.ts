import dotenv from 'dotenv';
import type { AppConfig } from '$lib/types/config.js';

dotenv.config();

export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.APPSCRIPT_WEB_APP_URL?.trim()) missing.push('APPSCRIPT_WEB_APP_URL');
  if (!process.env.APPSCRIPT_SECRET?.trim()) missing.push('APPSCRIPT_SECRET');
  if (!process.env.DRIVE_FOLDER_ID?.trim()) missing.push('DRIVE_FOLDER_ID');
  if (!process.env.GEMINI_API_KEY?.trim()) missing.push('GEMINI_API_KEY');
  return missing;
}

export function loadConfig(): AppConfig {
  const appscriptWebAppUrl = process.env.APPSCRIPT_WEB_APP_URL?.trim();
  const appscriptSecret = process.env.APPSCRIPT_SECRET?.trim();
  const driveFolderId = process.env.DRIVE_FOLDER_ID?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
  const pollIntervalMinutes = parseInt(process.env.POLL_INTERVAL_MINUTES?.trim() || '5', 10);
  const maxConcurrency = parseInt(process.env.MAX_CONCURRENCY?.trim() || '3', 10);
  const outputDir = process.env.OUTPUT_DIR?.trim() || './output';
  const pageOrderRegexStr = process.env.PAGE_ORDER_REGEX?.trim();

  const useBatchMode =
    process.env.USE_BATCH_MODE === undefined || process.env.USE_BATCH_MODE.trim() === ''
      ? true
      : process.env.USE_BATCH_MODE.trim().toLowerCase() !== 'false';
  const batchWaitBeforeSubmitMinutes = parseInt(
    process.env.BATCH_WAIT_BEFORE_SUBMIT_MINUTES?.trim() || '10',
    10,
  );
  const batchPollIntervalMinutes = parseInt(
    process.env.BATCH_POLL_INTERVAL_MINUTES?.trim() || '20',
    10,
  );
  const batchMaxImagesPerJob = parseInt(process.env.BATCH_MAX_IMAGES_PER_JOB?.trim() || '300', 10);
  const directOcrTargetRpm = parseInt(process.env.DIRECT_OCR_TARGET_RPM?.trim() || '10', 10);

  const missingFields = getMissingEnvVars();
  if (missingFields.length > 0) {
    throw new Error(`Missing required environment variables: ${missingFields.join(', ')}`);
  }

  let pageOrderRegex: RegExp | undefined;
  if (pageOrderRegexStr) {
    try {
      pageOrderRegex = new RegExp(pageOrderRegexStr);
    } catch {
      throw new Error(`Invalid PAGE_ORDER_REGEX pattern: ${pageOrderRegexStr}`);
    }
  }

  return {
    appscriptWebAppUrl: appscriptWebAppUrl!,
    appscriptSecret: appscriptSecret!,
    driveFolderId: driveFolderId!,
    geminiApiKey: geminiApiKey!,
    geminiModel,
    pollIntervalMinutes:
      isNaN(pollIntervalMinutes) || pollIntervalMinutes < 1 ? 5 : pollIntervalMinutes,
    maxConcurrency: isNaN(maxConcurrency) || maxConcurrency < 1 ? 3 : maxConcurrency,
    outputDir,
    pageOrderRegex,
    useBatchMode,
    batchWaitBeforeSubmitMinutes:
      isNaN(batchWaitBeforeSubmitMinutes) || batchWaitBeforeSubmitMinutes < 0
        ? 10
        : batchWaitBeforeSubmitMinutes,
    batchPollIntervalMinutes:
      isNaN(batchPollIntervalMinutes) || batchPollIntervalMinutes < 1
        ? 20
        : batchPollIntervalMinutes,
    batchMaxImagesPerJob:
      isNaN(batchMaxImagesPerJob) || batchMaxImagesPerJob < 1 ? 300 : batchMaxImagesPerJob,
    directOcrTargetRpm:
      isNaN(directOcrTargetRpm) || directOcrTargetRpm < 1 ? 10 : directOcrTargetRpm,
  };
}
