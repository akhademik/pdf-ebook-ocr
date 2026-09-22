import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const GET: RequestHandler = async () => {
  const status = await orchestrator.getStatus();
  return json(status);
};
