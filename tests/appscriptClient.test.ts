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
        bookName: 'CuonSach1',
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
    expect(result.files[0].bookName).toBe('CuonSach1');
    expect(result.folderName).toBe('Scans');
  });

  it('should call deleteBookRows with bookName', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, deletedCount: 15, bookName: 'CuonSach1' }),
    } as Response);

    const result = await client.deleteBookRows('CuonSach1');
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(15);
    expect(global.fetch).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: mockSecret,
          action: 'deleteBookRows',
          bookName: 'CuonSach1',
        }),
      }),
    );
  });

  it('should call appendRows with items array', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: 2, startRow: 2 }),
    } as Response);

    const records = [
      {
        fileName: '001.jpg',
        status: 'pending' as const,
        driveFileId: 'f1',
        ocrText: '',
        errorMessage: '',
        note: '',
      },
      {
        fileName: '002.jpg',
        status: 'pending' as const,
        driveFileId: 'f2',
        ocrText: '',
        errorMessage: '',
        note: '',
      },
    ];

    const result = await client.appendRows(records);
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          token: mockSecret,
          action: 'appendRows',
          data: records,
        }),
      }),
    );
  });
});
