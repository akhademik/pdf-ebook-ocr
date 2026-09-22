import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { batchRunManager } from '$lib/server/batchRunManager.js';

export const GET: RequestHandler = async () => {
  const runs = batchRunManager.getAllRuns();
  return json({ runs });
};
