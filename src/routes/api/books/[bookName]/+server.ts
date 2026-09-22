import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';
import { batchRunManager } from '$lib/server/batchRunManager.js';

export const DELETE: RequestHandler = async ({ params }) => {
  const bookName = decodeURIComponent(params.bookName || '').trim();
  if (!bookName) {
    return json({ error: 'Tên sách không hợp lệ' }, { status: 400 });
  }

  const appscriptClient = orchestrator.getAppscriptClient();
  if (!appscriptClient) {
    return json({ error: 'Apps Script client chưa được khởi tạo' }, { status: 400 });
  }

  try {
    const result = await appscriptClient.deleteBookRows(bookName);
    return json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ params }) => {
  const bookName = decodeURIComponent(params.bookName || '').trim();
  if (!bookName) {
    return json({ error: 'Tên sách không hợp lệ' }, { status: 400 });
  }

  const appscriptClient = orchestrator.getAppscriptClient();
  const geminiClient = orchestrator.getGeminiClient();
  const geminiBatchClient = orchestrator.getGeminiBatchClient();

  if (!appscriptClient || !geminiClient || !geminiBatchClient) {
    return json({ error: 'Dịch vụ chưa được cấu hình đầy đủ biến môi trường' }, { status: 400 });
  }

  if (batchRunManager.isBookRunning(bookName)) {
    return json(
      {
        error: `Cuốn sách "${bookName}" đang có một tiến trình nạp batch đang chạy.`,
        run: batchRunManager.getRunForBook(bookName),
      },
      { status: 409 },
    );
  }

  const run = batchRunManager.createAndStartRun(bookName, {
    appscriptClient,
    geminiClient,
    geminiBatchClient,
  });

  return json({ success: true, run }, { status: 202 });
};
