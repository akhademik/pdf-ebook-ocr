import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_OCR_PROMPT,
  ALLOWED_FLASH_MODELS,
  GeminiClient,
  parseRetryAfter,
} from '../src/lib/server/geminiClient.js';
import { directOcrRateLimiter } from '../src/lib/server/rateLimiter.js';

describe('GeminiClient Prompt, Models & Rate Limit / Error Handling', () => {
  beforeEach(() => {
    directOcrRateLimiter.reset();
  });

  it('should have the exact 10 rules in DEFAULT_OCR_PROMPT emphasizing visual evidence', () => {
    expect(DEFAULT_OCR_PROMPT).toContain('Bạn là một công cụ OCR (Optical Character Recognition)');
    expect(DEFAULT_OCR_PROMPT).toContain('1. Trả về TRỰC TIẾP văn bản đã trích xuất.');
    expect(DEFAULT_OCR_PROMPT).toContain('2. Giữ nguyên cấu trúc xuống dòng, đoạn văn');
    expect(DEFAULT_OCR_PROMPT).toContain('3. Nội dung chính trong sách là TIẾNG VIỆT');
    expect(DEFAULT_OCR_PROMPT).toContain('4. Ưu tiên tuyệt đối những gì nhìn thấy trên ảnh');
    expect(DEFAULT_OCR_PROMPT).toContain(
      '5. QUAN TRỌNG: Nếu trong văn bản xuất hiện các cụm từ/câu được giữ NGUYÊN VĂN',
    );
    expect(DEFAULT_OCR_PROMPT).toContain('6. Với các cụm ngoại ngữ này');
    expect(DEFAULT_OCR_PROMPT).toContain('7. Nếu trang ảnh trống hoặc không có chữ');
    expect(DEFAULT_OCR_PROMPT).toContain('8. Nếu trong ảnh có hình vẽ/tranh minh họa');
    expect(DEFAULT_OCR_PROMPT).toContain('9. Nếu bạn không chắc chắn đã đọc đúng 100%');
    expect(DEFAULT_OCR_PROMPT).toContain('10. Nhận diện định dạng chữ theo kiểu Markdown');
  });

  it('should restrict allowed models strictly to verified Flash models', () => {
    const ids = ALLOWED_FLASH_MODELS.map((m) => m.id);
    expect(ids).toEqual(['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash']);
  });

  it('should use default prompt if no custom prompt provided, and switch when custom prompt is set', () => {
    const client = new GeminiClient('test-key', 'gemini-3.6-flash');
    expect(client.getPrompt()).toBe(DEFAULT_OCR_PROMPT);
    expect(client.getCustomPrompt()).toBe('');

    client.setPrompt('Custom prompt test');
    expect(client.getPrompt()).toBe('Custom prompt test');
    expect(client.getCustomPrompt()).toBe('Custom prompt test');

    client.resetPrompt();
    expect(client.getPrompt()).toBe(DEFAULT_OCR_PROMPT);
  });

  it('should parse retry delay from retry-after header, RPC RetryInfo, or error message', () => {
    expect(parseRetryAfter({ headers: { 'retry-after': '42' } })).toBe(42);
    expect(
      parseRetryAfter({
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37.5s' }],
      }),
    ).toBe(37.5);
    expect(
      parseRetryAfter({ details: [{ '@type': 'RetryInfo', retryDelay: { seconds: 50 } }] }),
    ).toBe(50);
    expect(parseRetryAfter(new Error('Quota exceeded. Please retry after 15s'))).toBe(15);
    expect(parseRetryAfter(new Error('Generic network error'))).toBeNull();
  });

  it('should classify blank pages as status done with blank note without retrying', async () => {
    const client = new GeminiClient('test-key', 'gemini-3.6-flash');
    (client as any).ai = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: '   ',
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '' }] } }],
        }),
      },
    };

    const result = await client.performOcr('base64', 'image/jpeg', undefined, 'page_blank.jpg');
    expect(result.status).toBe('done');
    expect(result.text).toBe('');
    expect(result.isBlankPage).toBe(true);
    expect(result.note).toContain('[TRANG_TRANG]');
  });

  it('should classify sexual content / safety filter refusal as permanent error without retrying', async () => {
    const client = new GeminiClient('test-key', 'gemini-3.6-flash');
    (client as any).ai = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: '',
          candidates: [{ finishReason: 'SAFETY' }],
        }),
      },
    };

    const result = await client.performOcr('base64', 'image/jpeg', undefined, 'page_safety.jpg');
    expect(result.status).toBe('error');
    expect(result.isSafetyBlocked).toBe(true);
    expect(result.isPermanentError).toBe(true);
    expect(result.note).toBe('[SEXUAL_CONTENT]');
    expect(result.errorMessage).toContain('[SEXUAL_CONTENT]');
  });

  it('should classify recitation / copyright refusal as permanent error without retrying', async () => {
    const client = new GeminiClient('test-key', 'gemini-3.6-flash');
    (client as any).ai = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: '',
          candidates: [{ finishReason: 'RECITATION' }],
        }),
      },
    };

    const result = await client.performOcr(
      'base64',
      'image/jpeg',
      undefined,
      'page_recitation.jpg',
    );
    expect(result.status).toBe('error');
    expect(result.isCopyrightBlocked).toBe(true);
    expect(result.isPermanentError).toBe(true);
    expect(result.note).toBe('[COPYRIGHTED]');
    expect(result.errorMessage).toContain('[COPYRIGHTED]');
  });
});
