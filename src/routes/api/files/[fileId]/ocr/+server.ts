import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const POST: RequestHandler = async ({ params }) => {
  const fileId = params.fileId;
  const syncService = orchestrator.getSyncService();

  if (!syncService) {
    return json({ error: 'Sync service not initialized' }, { status: 400 });
  }

  try {
    const updatedRecord = await syncService.processSingleFileById(fileId);
    return json({ success: true, record: updatedRecord });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
