import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { orchestrator } from '$lib/server/orchestrator.js';
import { generateMarkdownZip } from '$lib/server/exportZip.js';

async function handleExportZip(bookName?: string) {
  const appscriptClient = orchestrator.getAppscriptClient();

  if (!appscriptClient) {
    return json({ error: 'Apps Script client not initialized' }, { status: 400 });
  }

  const records = await appscriptClient.readSheetRows();
  const zipResult = await generateMarkdownZip(records, bookName);

  return new Response(Buffer.from(zipResult.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipResult.fileName}"`,
      'X-Exported-Count': zipResult.count.toString(),
    },
  });
}

export const GET: RequestHandler = async ({ url }) => {
  try {
    const book = url.searchParams.get('book') || undefined;
    return await handleExportZip(book);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request, url }) => {
  try {
    let book = url.searchParams.get('book') || undefined;
    try {
      const body = (await request.json()) as { book?: string };
      if (body.book) book = body.book;
    } catch {
      // Body is optional
    }
    return await handleExportZip(book);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, { status: 500 });
  }
};
