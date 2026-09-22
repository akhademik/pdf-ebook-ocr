import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const POST: RequestHandler = async ({ request }) => {
  const syncService = orchestrator.getSyncService();
  if (!syncService) {
    return json(
      { error: 'Sync service is not configured or setup check not passed' },
      { status: 400 },
    );
  }

  if (syncService.isBusy()) {
    return json({ error: 'Một tiến trình đồng bộ hoặc batch đang chạy' }, { status: 409 });
  }

  let action = 'sync';
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action) action = body.action;
  } catch {
    // Body is optional
  }

  if (action === 'poll') {
    const pollResult = await syncService.pollRunningBatches();
    return json({ success: true, action: 'poll', pollResult });
  } else if (action === 'submit') {
    const summary = await syncService.submitPendingBatches();
    return json({ success: true, action: 'submit', summary });
  } else {
    const summary = await syncService.runSyncCycle();
    return json({ success: true, action: 'sync', summary });
  }
};
