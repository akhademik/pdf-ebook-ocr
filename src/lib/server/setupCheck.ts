import type { AppConfig, SetupCheckResult, SetupCheckStep } from '$lib/types/config.js';
import { AppscriptClient } from './appscriptClient.js';
import { GeminiClient } from './geminiClient.js';
import { logger } from './logger.js';

export interface ValidatedClients {
  appscriptClient: AppscriptClient;
  geminiClient: GeminiClient;
}

export async function checkSetupSteps(config: AppConfig): Promise<SetupCheckResult> {
  const steps: SetupCheckStep[] = [
    {
      name: 'appscript_bridge',
      title: 'Google Apps Script Bridge & Google Sheet',
      status: 'pending',
      message: 'Kiểm tra kết nối Apps Script Web App và Secret Token...',
    },
    {
      name: 'drive_folder',
      title: 'Google Drive Folder Access',
      status: 'pending',
      message: 'Xác thực quyền truy cập thư mục Google Drive...',
    },
    {
      name: 'gemini_api',
      title: 'Gemini OCR API',
      status: 'pending',
      message: 'Kiểm tra API Key và Model Gemini...',
    },
  ];

  let driveFolderName = '';
  const appscriptClient = new AppscriptClient(config.appscriptWebAppUrl, config.appscriptSecret);
  const geminiClient = new GeminiClient(config.geminiApiKey, config.geminiModel);

  // 1. Check Apps Script & Sheet Header
  try {
    const res = await appscriptClient.ensureHeader();
    steps[0].status = 'success';
    steps[0].message = `Kết nối thành công (${res.message || 'Header OK'})`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps[0].status = 'error';
    steps[0].message = 'Không thể kết nối đến Google Apps Script';
    steps[0].details = `Lỗi: ${msg}. Hãy kiểm tra APPSCRIPT_WEB_APP_URL và APPSCRIPT_SECRET đã khớp với SECRET_TOKEN trong Script Properties chưa.`;
    return { success: false, steps };
  }

  // 2. Check Drive Folder
  try {
    const driveRes = await appscriptClient.listImages(config.driveFolderId);
    driveFolderName = driveRes.folderName || config.driveFolderId;
    steps[1].status = 'success';
    steps[1].message = `Đã kết nối folder "${driveFolderName}" (tìm thấy ${driveRes.files.length} ảnh)`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps[1].status = 'error';
    steps[1].message = `Không truy cập được folder Google Drive (${config.driveFolderId})`;
    steps[1].details = `Hãy kiểm tra lại DRIVE_FOLDER_ID và đảm bảo tài khoản Google sở hữu Apps Script có quyền truy cập vào folder này. Lỗi: ${msg}`;
    return { success: false, steps, driveFolderName };
  }

  // 3. Check Gemini API
  try {
    await geminiClient.testConnection();
    steps[2].status = 'success';
    steps[2].message = `Kết nối Gemini API thành công (${config.geminiModel})`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps[2].status = 'error';
    steps[2].message = `Lỗi kết nối Gemini API (${config.geminiModel})`;
    steps[2].details = `Kiểm tra lại GEMINI_API_KEY hoặc GEMINI_MODEL. Lỗi: ${msg}`;
    return { success: false, steps, driveFolderName };
  }

  return {
    success: true,
    steps,
    driveFolderName,
  };
}

export async function runSetupCheck(config: AppConfig): Promise<ValidatedClients> {
  const result = await checkSetupSteps(config);
  if (!result.success) {
    const failedStep = result.steps.find((s) => s.status === 'error');
    logger.error(
      `Setup check failed at: ${failedStep?.title}. ${failedStep?.details || failedStep?.message}`,
    );
    process.exit(1);
  }

  logger.info('✅ Setup OK, bắt đầu chạy...');
  return {
    appscriptClient: new AppscriptClient(config.appscriptWebAppUrl, config.appscriptSecret),
    geminiClient: new GeminiClient(config.geminiApiKey, config.geminiModel),
  };
}
