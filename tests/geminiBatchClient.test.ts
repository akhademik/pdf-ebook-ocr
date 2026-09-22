import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiBatchClient } from '../src/lib/server/geminiBatchClient.js';

describe('GeminiBatchClient', () => {
  let client: GeminiBatchClient;

  beforeEach(() => {
    client = new GeminiBatchClient('test_api_key');
  });

  it('should format and submit batch job with :batchGenerateContent endpoint and nested batch payload', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 1. Mock file upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ file: { name: 'files/abc123upload', uri: 'https://...' } }),
    });

    // 2. Mock getFileMetadata verification
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'files/abc123upload',
        displayName: 'TestBook-part-1.jsonl',
        mimeType: 'application/jsonl',
        sizeBytes: '1024',
        state: 'ACTIVE',
      }),
    });

    // 3. Mock batch create
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'batches/job-xyz-789' }),
    });

    const result = await client.submitBatchJob(
      'gemini-3.6-flash',
      [
        { key: 'file1', base64: 'base64_data_1', mimeType: 'image/jpeg' },
        { key: 'file2', base64: 'base64_data_2', mimeType: 'image/png' },
      ],
      'Sample prompt',
      'TestBook',
    );

    expect(result.batchId).toBe('batches/job-xyz-789');
    expect(result.totalImages).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify 3rd call (batch creation)
    const [createUrl, createOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
    expect(createUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:batchGenerateContent?key=test_api_key',
    );
    expect(createOptions.method).toBe('POST');

    const parsedBody = JSON.parse(createOptions.body as string) as {
      batch: { display_name: string; input_config: { file_name: string } };
    };
    expect(parsedBody.batch).toBeDefined();
    expect(parsedBody.batch.display_name).toBe('TestBook');
    expect(parsedBody.batch.input_config.file_name).toBe('files/abc123upload');
  });

  it('should throw detailed error with status and response body when batch creation fails', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 1. Mock file upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ file: { name: 'files/abc123upload', uri: 'https://...' } }),
    });

    // 2. Mock getFileMetadata verification
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'files/abc123upload',
        displayName: 'TestBook-part-1.jsonl',
        mimeType: 'application/jsonl',
        sizeBytes: '512',
        state: 'ACTIVE',
      }),
    });

    // 3. Mock batch create failure (404)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => '{"error": {"code": 404, "message": "Method not found"}}',
    });

    await expect(
      client.submitBatchJob(
        'gemini-3.6-flash',
        [{ key: 'file1', base64: 'base64_data_1', mimeType: 'image/jpeg' }],
        'Sample prompt',
        'TestBook',
      ),
    ).rejects.toThrow(
      'Failed to create Gemini Batch job (404): {"error": {"code": 404, "message": "Method not found"}}',
    );
  });

  it('should parse batch status correctly without duplicated batches prefix', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        state: 'JOB_STATE_SUCCEEDED',
        output_file: 'files/result123',
      }),
    });

    const status = await client.checkBatchStatus('batches/job-xyz-789');
    expect(status.state).toBe('completed');
    expect(status.outputUri).toBe('files/result123');

    const [statusUrl] = mockFetch.mock.calls[0] as [string];
    expect(statusUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/batches/job-xyz-789?key=test_api_key',
    );
  });

  it('should parse JSONL batch results into mapped keys', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const mockJsonlOutput = [
      JSON.stringify({
        key: 'file1',
        response: {
          candidates: [{ content: { parts: [{ text: 'OCR Result Page 1' }] } }],
        },
      }),
      JSON.stringify({
        key: 'file2',
        response: {
          candidates: [{ content: { parts: [{ text: 'OCR Result Page 2' }] } }],
        },
      }),
    ].join('\n');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => mockJsonlOutput,
    });

    const results = await client.fetchBatchResults('batches/job-xyz-789', 'files/result123');
    expect(results.size).toBe(2);
    expect(results.get('file1')?.ocrText).toBe('OCR Result Page 1');
    expect(results.get('file2')?.ocrText).toBe('OCR Result Page 2');
  });
});
