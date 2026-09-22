import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const POST: RequestHandler = async () => {
  const syncService = orchestrator.getSyncService();
  if (!syncService) {
    return json(
      { error: 'Sync service is not configured or setup check not passed' },
      { status: 400 },
    );
  }

  if (syncService.isBusy()) {
    return json({ error: 'Sync cycle is already running' }, { status: 409 });
  }

  // Run in background or wait
  const summaryPromise = syncService.runSyncCycle();
  const summary = await summaryPromise;

  return json({ success: true, summary });
};
