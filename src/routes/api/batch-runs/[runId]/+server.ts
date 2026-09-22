import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { batchRunManager } from '$lib/server/batchRunManager.js';

export const GET: RequestHandler = async ({ params }) => {
  const runId = params.runId;
  if (!runId) {
    return json({ error: 'Missing runId' }, { status: 400 });
  }

  const run = batchRunManager.getRun(runId);
  if (!run) {
    return json({ error: 'Batch run not found' }, { status: 404 });
  }

  return json(run);
};
