import { describe, it, expect, beforeEach } from 'vitest';
import { loadConfig } from '../src/lib/server/config.js';
import { directOcrRateLimiter } from '../src/lib/server/rateLimiter.js';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should throw error when required env vars are missing', () => {
    delete process.env.APPSCRIPT_WEB_APP_URL;
    delete process.env.APPSCRIPT_SECRET;
    delete process.env.DRIVE_FOLDER_ID;
    delete process.env.GEMINI_API_KEY;

    expect(() => loadConfig()).toThrow('Missing required environment variables');
  });

  it('should parse valid env vars and use default values', () => {
    process.env.APPSCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/test/exec';
    process.env.APPSCRIPT_SECRET = 'secret123';
    process.env.DRIVE_FOLDER_ID = 'test_folder_id';
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.USE_BATCH_MODE = 'true';

    const config = loadConfig();
    expect(config.appscriptWebAppUrl).toBe('https://script.google.com/macros/s/test/exec');
    expect(config.appscriptSecret).toBe('secret123');
    expect(config.driveFolderId).toBe('test_folder_id');
    expect(config.geminiApiKey).toBe('test_gemini_key');
    expect(config.geminiModel).toBe('gemini-3.6-flash');
    expect(config.useBatchMode).toBe(true);
    expect(config.batchWaitBeforeSubmitMinutes).toBe(10);
    expect(config.batchPollIntervalMinutes).toBe(20);
    expect(config.batchMaxImagesPerJob).toBe(300);
    expect(config.directOcrTargetRpm).toBe(10);
    expect(config.pollIntervalMinutes).toBe(5);
    expect(config.maxConcurrency).toBe(3);
    expect(config.outputDir).toBe('./output');
  });

  it('should update directOcrRateLimiter targetRpm when DIRECT_OCR_TARGET_RPM is configured', () => {
    process.env.APPSCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/test/exec';
    process.env.APPSCRIPT_SECRET = 'secret123';
    process.env.DRIVE_FOLDER_ID = 'test_folder_id';
    process.env.GEMINI_API_KEY = 'test_gemini_key';
    process.env.DIRECT_OCR_TARGET_RPM = '15';

    const config = loadConfig();
    expect(config.directOcrTargetRpm).toBe(15);
    expect(directOcrRateLimiter.getStatus().targetRpm).toBe(15);
  });
});
