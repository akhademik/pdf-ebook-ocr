import { describe, it, expect } from 'vitest';
import { extractPageOrder } from '../src/lib/utils/pageOrderExtractor.js';

describe('pageOrderExtractor', () => {
  it('should extract first numbers from file name with default pattern', () => {
    expect(extractPageOrder('001.jpg', '2026-01-01T00:00:00Z')).toBe(1);
    expect(extractPageOrder('page-002.png', '2026-01-01T00:00:00Z')).toBe(2);
    expect(extractPageOrder('scan_3_preview.jpg', '2026-01-01T00:00:00Z')).toBe(3);
    expect(extractPageOrder('document_page45.png', '2026-01-01T00:00:00Z')).toBe(45);
  });

  it('should support custom regex', () => {
    const customRegex = /page_(\d+)/;
    expect(extractPageOrder('test_page_12_img.png', '2026-01-01T00:00:00Z', customRegex)).toBe(12);
  });

  it('should fallback to timestamp if no number exists in file name', () => {
    const timestamp = '2026-01-01T00:00:00Z';
    const expected = Math.floor(new Date(timestamp).getTime() / 1000);
    expect(extractPageOrder('image_without_num.png', timestamp)).toBe(expected);
  });
});
