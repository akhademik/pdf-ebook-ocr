import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

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
  const syncService = orchestrator.getSyncService();
  if (!syncService) {
    return json({ error: 'Sync service chưa được khởi tạo' }, { status: 400 });
  }

  if (syncService.isBusy()) {
    return json({ error: 'Tiến trình khác đang chạy' }, { status: 409 });
  }

  try {
    const summary = await syncService.submitPendingBatches(bookName);
    return json({ success: true, bookName, summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
