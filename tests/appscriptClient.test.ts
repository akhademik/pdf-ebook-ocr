import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppscriptClient } from '../src/lib/server/appscriptClient.js';

describe('AppscriptClient', () => {
  const mockUrl = 'https://script.google.com/macros/s/test/exec';
  const mockSecret = 'secret123';
  let client: AppscriptClient;

  beforeEach(() => {
    client = new AppscriptClient(mockUrl, mockSecret);
    vi.restoreAllMocks();
  });

  it('should call ensureHeader and return success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, message: 'Header already exists' }),
    } as Response);

    const result = await client.ensureHeader();
    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: mockSecret, action: 'ensureHeader' }),
      }),
    );
  });

  it('should throw unauthorized error when 403 status is returned', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Unauthorized' }),
    } as Response);

    await expect(client.ensureHeader()).rejects.toThrow('403 Unauthorized');
  });

  it('should parse listImages response', async () => {
    const mockFiles = [
      {
        id: 'file1',
        name: '001.jpg',
        md5Checksum: 'hash1',
        createdTime: '2026-01-01T00:00:00Z',
        mimeType: 'image/jpeg',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, folderName: 'Scans', files: mockFiles }),
    } as Response);

    const result = await client.listImages('folder123');
    expect(result.files.length).toBe(1);
    expect(result.files[0].name).toBe('001.jpg');
    expect(result.folderName).toBe('Scans');
  });
});
