import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const GET: RequestHandler = async ({ params }) => {
  const fileId = params.fileId;
  const appscriptClient = orchestrator.getAppscriptClient();

  if (!appscriptClient) {
    return json({ error: 'Apps Script client not initialized' }, { status: 400 });
  }

  try {
    const { base64, mimeType } = await appscriptClient.getImageBase64(fileId);
    return json({
      base64,
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
