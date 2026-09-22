import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const GET: RequestHandler = async () => {
  return json({
    useBatchMode: orchestrator.getUseBatchMode(),
  });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as { useBatchMode?: boolean };
    if (typeof body.useBatchMode !== 'boolean') {
      return json({ error: 'useBatchMode boolean is required' }, { status: 400 });
    }

    orchestrator.setUseBatchMode(body.useBatchMode);
    return json({
      success: true,
      useBatchMode: orchestrator.getUseBatchMode(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
