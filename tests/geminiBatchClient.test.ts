import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiBatchClient } from '../src/lib/server/geminiBatchClient.js';

describe('GeminiBatchClient', () => {
  let client: GeminiBatchClient;

  beforeEach(() => {
    client = new GeminiBatchClient('test_api_key');
  });

  it('should format and submit batch job with jsonl upload', async () => {
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    // 1. Mock file upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ file: { name: 'files/abc123upload', uri: 'https://...' } }),
    });

    // 2. Mock batch create
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'batches/job-xyz-789' }),
    });

    const result = await client.submitBatchJob(
      'gemini-3.5-flash-lite',
      [
        { key: 'file1', base64: 'base64_data_1', mimeType: 'image/jpeg' },
        { key: 'file2', base64: 'base64_data_2', mimeType: 'image/png' },
      ],
      'Sample prompt',
      'TestBook',
    );

    expect(result.batchId).toBe('batches/job-xyz-789');
    expect(result.totalImages).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should parse batch status correctly', async () => {
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
