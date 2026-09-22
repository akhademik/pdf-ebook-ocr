import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';
import { DEFAULT_OCR_PROMPT } from '$lib/server/geminiClient.js';

export const GET: RequestHandler = async () => {
  const prompt = orchestrator.getActivePrompt();
  const isCustom = orchestrator.isCustomPrompt();
  return json({
    prompt,
    isCustom,
    defaultPrompt: DEFAULT_OCR_PROMPT,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { prompt?: string };
  const newPrompt = body.prompt !== undefined ? body.prompt : '';

  orchestrator.setActivePrompt(newPrompt);

  return json({
    success: true,
    prompt: orchestrator.getActivePrompt(),
    isCustom: orchestrator.isCustomPrompt(),
    defaultPrompt: DEFAULT_OCR_PROMPT,
  });
};
