import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';

export const GET: RequestHandler = async () => {
  const models = await orchestrator.getAvailableFlashModels();
  const currentModel = orchestrator.getActiveModel();
  return json({
    currentModel,
    models,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { model } = body as { model?: string };
  if (!model) {
    return json({ error: 'Model name is required' }, { status: 400 });
  }

  orchestrator.setActiveModel(model);
  return json({
    success: true,
    currentModel: orchestrator.getActiveModel(),
  });
};
