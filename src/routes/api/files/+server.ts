import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';
import { loadConfig } from '$lib/server/config.js';

export const GET: RequestHandler = async () => {
  try {
    const config = loadConfig();
    const appscriptClient = orchestrator.getAppscriptClient();

    if (!appscriptClient) {
      return json({ error: 'Apps Script client not initialized' }, { status: 400 });
    }

    const [sheetRecords, driveRes] = await Promise.all([
      appscriptClient.readSheetRows(),
      appscriptClient.listImages(config.driveFolderId),
    ]);

    return json({
      sheetRecords,
      driveFiles: driveRes.files || [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
