import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const POST: RequestHandler = async () => {
  const result = await orchestrator.runSetupCheck();
  return json(result);
};
