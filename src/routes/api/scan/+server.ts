import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const POST: RequestHandler = async () => {
  const syncService = orchestrator.getSyncService();
  if (!syncService) {
    return json({ error: 'Sync service chưa được cấu hình' }, { status: 400 });
  }

  if (syncService.isBusy()) {
    return json({ error: 'Một tiến trình khác đang chạy' }, { status: 409 });
  }

  try {
    const result = await syncService.discoverAndSyncSheet();
    return json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
