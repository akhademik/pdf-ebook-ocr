import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OCR_PROMPT,
  ALLOWED_FLASH_MODELS,
  GeminiClient,
} from '../src/lib/server/geminiClient.js';

describe('GeminiClient Prompt & Models', () => {
  it('should have the exact 10 rules in DEFAULT_OCR_PROMPT', () => {
    expect(DEFAULT_OCR_PROMPT).toContain('Bạn là một công cụ OCR (Optical Character Recognition)');
    expect(DEFAULT_OCR_PROMPT).toContain('1. Trả về TRỰC TIẾP văn bản đã trích xuất.');
    expect(DEFAULT_OCR_PROMPT).toContain('2. Giữ nguyên cấu trúc xuống dòng, đoạn văn');
    expect(DEFAULT_OCR_PROMPT).toContain('3. Nội dung chính trong sách là TIẾNG VIỆT');
    expect(DEFAULT_OCR_PROMPT).toContain('4. Nếu ảnh có ký tự bị mờ/không rõ');
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
    expect(ids).toEqual(['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.6-flash-lite']);
  });

  it('should use default prompt if no custom prompt provided, and switch when custom prompt is set', () => {
    const client = new GeminiClient('test-key', 'gemini-3.6-flash');
    expect(client.getPrompt()).toBe(DEFAULT_OCR_PROMPT);
    expect(client.getCustomPrompt()).toBe('');

    client.setPrompt('Custom prompt test');
    expect(client.getPrompt()).toBe('Custom prompt test');
    expect(client.getCustomPrompt()).toBe('Custom prompt test');

    client.setPrompt('');
    expect(client.getPrompt()).toBe(DEFAULT_OCR_PROMPT);
  });
});
