import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';
import { directOcrRateLimiter } from './rateLimiter.js';
import type { GeminiModelInfo } from '$lib/types/config.js';

export const DEFAULT_OCR_PROMPT = `Bạn là một công cụ OCR (Optical Character Recognition) chuyên nghiệp cho sách tiếng Việt scan.
Nhiệm vụ DUY NHẤT của bạn là trích xuất TOÀN BỘ văn bản xuất hiện trong ảnh được cung cấp.

TUYỆT ĐỐI TUÂN THỦ CÁC QUY TẮC SAU:
1. Trả về TRỰC TIẾP văn bản đã trích xuất. KHÔNG thêm lời chào, bình luận, mô tả ảnh, hay giải thích nào.
2. Giữ nguyên cấu trúc xuống dòng, đoạn văn, thứ tự đọc (trên xuống dưới, trái qua phải) như trong ảnh gốc.
3. Nội dung chính trong sách là TIẾNG VIỆT — trích xuất chính xác theo đúng chính tả tiếng Việt (đủ dấu thanh, đủ dấu phụ).
4. Ưu tiên tuyệt đối những gì nhìn thấy trên ảnh (visual evidence). Nếu chữ bị mờ/mất nét nhưng nhận diện được mặt chữ rõ ràng, trích xuất chính xác; nếu hoàn toàn không thể đọc rõ, hãy bọc phần phỏng đoán trong dấu {{ }} thay vì tự ý bịa chữ dựa trên trí nhớ/kiến thức.
5. QUAN TRỌNG: Nếu trong văn bản xuất hiện các cụm từ/câu được giữ NGUYÊN VĂN bằng ngôn ngữ khác (không phải tiếng Việt) — có thể là tiếng Anh, Pháp, Đức, Latinh, Hy Lạp, Hebrew, Trung, Nhật, hoặc bất kỳ hệ chữ viết nào khác — PHẢI giữ nguyên chính xác cụm từ đó bằng đúng ngôn ngữ/hệ chữ gốc, KHÔNG dịch, KHÔNG phiên âm sang tiếng Việt.
6. Với các cụm ngoại ngữ này, hãy đọc cẩn thận từng ký tự gốc. Nếu không chắc chắn, đặt trong {{ }} theo quy tắc 9.
7. Nếu trang ảnh trống hoặc không có chữ, trả về chuỗi rỗng.
8. Nếu trong ảnh có hình vẽ/tranh minh họa (không phải chữ viết), CHÈN marker [CÓ HÌNH] ngay tại vị trí hình đó xuất hiện trong luồng đọc, rồi tiếp tục trích xuất phần chữ còn lại (nếu có) phía sau. Nếu TOÀN BỘ trang chỉ là hình minh họa, không có chữ nào, trả về đúng: [CÓ HÌNH - TOÀN TRANG]
9. Nếu bạn không chắc chắn đã đọc đúng 100% một cụm từ ngoại ngữ (do ảnh mờ/nét chữ lạ), hãy bọc cụm đó trong dấu {{ }} để đánh dấu cần con người kiểm tra lại.
10. Nhận diện định dạng chữ theo kiểu Markdown: nếu đoạn/cụm từ được in ĐẬM (nét chữ dày, tối màu hơn xung quanh), bọc bằng **hai dấu sao** ở đầu và cuối, ví dụ **từ đậm**. Nếu được in NGHIÊNG (chữ xiên góc), bọc bằng *một dấu sao*, ví dụ *từ nghiêng*. Nếu vừa đậm vừa nghiêng, dùng ***ba dấu sao***. Chỉ đánh dấu khi thực sự nhìn rõ sự khác biệt về kiểu chữ so với văn bản thường xung quanh — không đoán bừa.

Đây là nhiệm vụ OCR thuần túy dựa trên hình ảnh được cung cấp. Chỉ trích xuất chính xác những gì bạn NHÌN THẤY trong ảnh, không dựa vào bất kỳ kiến thức hay trí nhớ nào có sẵn về nội dung văn bản này.`;

export { type GeminiModelInfo };

export const ALLOWED_FLASH_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    displayName: 'Gemini 3.6 Flash (Mặc định)',
    description: 'Thế hệ 3.6 Flash khuyến nghị bởi Google AI cho các tính năng mới nhất',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    displayName: 'Gemini 3.7 Flash',
    description: 'Thế hệ 3.7 Flash thế hệ mới với hiệu năng và độ chính xác cao',
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    displayName: 'Gemini 3.5 Flash',
    description: 'Thế hệ 3.5 Flash ổn định và tối ưu chi phí',
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OcrResult {
  text: string;
  status: 'done' | 'error';
  note: string;
  errorMessage: string;
  isPermanentError?: boolean;
  isBlankPage?: boolean;
  isSafetyBlocked?: boolean;
  isCopyrightBlocked?: boolean;
}

/**
 * Extract retry delay in seconds from error details/message or headers.
 */
export function parseRetryAfter(err: unknown): number | null {
  if (!err) return null;

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;

    // 1. Check HTTP Retry-After header
    const responseObj = obj.response as
      { headers?: { get?: (key: string) => string | null } } | undefined;
    const headersObj = obj.headers as Record<string, string> | undefined;
    const retryAfterHeader =
      responseObj?.headers?.get?.('retry-after') || headersObj?.['retry-after'];
    if (retryAfterHeader) {
      const parsed = parseFloat(retryAfterHeader);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 2. Check Google RPC RetryInfo
    const errObj = obj.error as { details?: unknown[] } | undefined;
    const details = (obj.details || obj.errorDetails || errObj?.details) as
      Array<Record<string, unknown>> | undefined;
    if (Array.isArray(details)) {
      for (const d of details) {
        const typeStr = typeof d?.['@type'] === 'string' ? (d['@type'] as string) : '';
        if (typeStr.includes('RetryInfo') || d?.retryDelay) {
          const delayStr = typeof d.retryDelay === 'string' ? d.retryDelay : '';
          const match = delayStr.match(/(\d+(?:\.\d+)?)s?/);
          if (match) {
            const parsed = parseFloat(match[1]);
            if (!isNaN(parsed) && parsed > 0) return parsed;
          }
          const retryDelayObj = d.retryDelay as { seconds?: number } | undefined;
          if (typeof retryDelayObj?.seconds === 'number') {
            return retryDelayObj.seconds;
          }
        }
      }
    }
  }

  // 3. Fallback regex on message
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/(?:retry(?:-after|\s+after|\s+in)?|wait)\s*:?\s*(\d+(?:\.\d+)?)\s*s?/i);
  if (match) {
    const parsed = parseFloat(match[1]);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private apiKey: string;
  private modelName: string;
  private customPrompt: string = '';

  constructor(apiKey: string, modelName: string = 'gemini-3.6-flash', customPrompt: string = '') {
    this.apiKey = apiKey.trim();
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    this.modelName = modelName.trim() || 'gemini-3.6-flash';
    this.customPrompt = customPrompt.trim();
  }

  public getModelName(): string {
    return this.modelName;
  }

  public setModel(model: string): void {
    this.modelName = model.trim();
  }

  public getPrompt(): string {
    return this.customPrompt || DEFAULT_OCR_PROMPT;
  }

  public getCustomPrompt(): string {
    return this.customPrompt;
  }

  public setPrompt(prompt: string): void {
    this.customPrompt = prompt.trim();
  }

  public resetPrompt(): void {
    this.customPrompt = '';
  }

  async listFlashModels(): Promise<GeminiModelInfo[]> {
    return [...ALLOWED_FLASH_MODELS];
  }

  /**
   * Test connection with configured model.
   */
  async testConnection(): Promise<void> {
    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: 'ping',
      });
      if (response && response.text) {
        return;
      }
    } catch (err: unknown) {
      const lastErr = err instanceof Error ? err : new Error(String(err));
      throw new Error(
        `Không thể kết nối Gemini API với model ${this.modelName}: ${lastErr.message}`,
      );
    }
  }

  /**
   * Perform Direct OCR on an image with global rate limiting, conservative spacing,
   * exponential backoff + jitter on 429, and explicit detection of blank pages,
   * sexual/safety refusals, and copyright recitation blocks.
   */
  async performOcr(
    imageBase64: string,
    mimeType: string,
    overridePrompt?: string,
    pageLabel?: string,
  ): Promise<OcrResult> {
    const promptToUse = overridePrompt || this.getPrompt();
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // 1. Acquire execution slot from global rate limiter (ensures no bursts across all jobs)
      await directOcrRateLimiter.acquire(pageLabel);

      const startTime = Date.now();
      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                {
                  text: promptToUse,
                },
              ],
            },
          ],
        });

        const duration = Date.now() - startTime;
        const respObj = response as {
          candidates?: Array<{
            finishReason?: string;
            content?: { parts?: Array<{ text?: string }> };
          }>;
          text?: string;
        };
        const candidate = respObj?.candidates?.[0];
        const finishReason = (candidate?.finishReason || '').toString().toUpperCase();

        // 2. Check for Safety / Sexual content block
        if (
          finishReason === 'SAFETY' ||
          finishReason === 'PROHIBITED_CONTENT' ||
          finishReason === 'SPII'
        ) {
          directOcrRateLimiter.recordSuccess(pageLabel);
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=safety_blocked reason=SEXUAL_OR_SAFETY duration=${duration}ms`,
          );
          return {
            text: '',
            status: 'error',
            note: '[SEXUAL_CONTENT]',
            errorMessage:
              '[SEXUAL_CONTENT] Gemini từ chối OCR do vi phạm bộ lọc an toàn / nội dung nhạy cảm',
            isSafetyBlocked: true,
            isPermanentError: true,
          };
        }

        // 3. Check for Recitation / Copyright block
        if (finishReason === 'RECITATION' || finishReason === 'BLOCKLIST') {
          directOcrRateLimiter.recordSuccess(pageLabel);
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=recitation_blocked reason=COPYRIGHTED duration=${duration}ms`,
          );
          return {
            text: '',
            status: 'error',
            note: '[COPYRIGHTED]',
            errorMessage:
              '[COPYRIGHTED] Gemini từ chối trích dẫn văn bản do chính sách bản quyền (RECITATION)',
            isCopyrightBlocked: true,
            isPermanentError: true,
          };
        }

        const rawText =
          respObj.text || candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
        const text = rawText.trim();

        // 4. Check for Blank page
        if (text === '') {
          directOcrRateLimiter.recordSuccess(pageLabel);
          logger.info(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=blank_page duration=${duration}ms`,
          );
          return {
            text: '',
            status: 'done',
            note: '[TRANG_TRANG] Trang trắng / Không có chữ',
            errorMessage: '',
            isBlankPage: true,
          };
        }

        // 5. Successful OCR
        directOcrRateLimiter.recordSuccess(pageLabel);
        logger.info(
          `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=success duration=${duration}ms`,
        );
        return {
          text,
          status: 'done',
          note: '',
          errorMessage: '',
        };
      } catch (err: unknown) {
        const duration = Date.now() - startTime;
        const lastErr = err instanceof Error ? err : new Error(String(err));
        const errMsg = lastErr.message.toLowerCase();

        // A. Permanent Content Safety / Sexual refusal in error response
        if (
          errMsg.includes('safety') ||
          errMsg.includes('sexu') ||
          errMsg.includes('prohibited_content') ||
          errMsg.includes('harm_category')
        ) {
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=safety_blocked duration=${duration}ms error="${lastErr.message}"`,
          );
          return {
            text: '',
            status: 'error',
            note: '[SEXUAL_CONTENT]',
            errorMessage: `[SEXUAL_CONTENT] Gemini từ chối OCR: ${lastErr.message}`,
            isSafetyBlocked: true,
            isPermanentError: true,
          };
        }

        // B. Permanent Copyright / Recitation refusal in error response
        if (errMsg.includes('recitation') || errMsg.includes('copyright')) {
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=recitation_blocked duration=${duration}ms error="${lastErr.message}"`,
          );
          return {
            text: '',
            status: 'error',
            note: '[COPYRIGHTED]',
            errorMessage: `[COPYRIGHTED] Gemini từ chối do chính sách bản quyền: ${lastErr.message}`,
            isCopyrightBlocked: true,
            isPermanentError: true,
          };
        }

        // C. Rate limit 429 / RESOURCE_EXHAUSTED
        const isRateLimit =
          errMsg.includes('429') ||
          errMsg.includes('resource_exhausted') ||
          errMsg.includes('rate limit') ||
          errMsg.includes('quota exceeded');

        if (isRateLimit) {
          const retryAfterSec = parseRetryAfter(lastErr);
          directOcrRateLimiter.recordRateLimit(retryAfterSec || undefined, pageLabel);

          if (attempt < maxRetries) {
            const baseMs = retryAfterSec
              ? retryAfterSec * 1000
              : attempt === 0
                ? 5000
                : attempt === 1
                  ? 15000
                  : 35000;
            const jitterMs = Math.floor(Math.random() * 1000) + 500;
            const delayMs = baseMs + jitterMs;

            logger.warn(
              `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=429 retryAfter=${retryAfterSec ?? 'none'} retry=${attempt + 1}/${maxRetries} backoff=${delayMs}ms error="${lastErr.message}"`,
            );
            await sleep(delayMs);
            continue;
          }
        }

        // D. Non-retryable Client error (400, 401, 403, 404, invalid argument, unsupported image)
        const isClientError =
          errMsg.includes('invalid_argument') ||
          errMsg.includes('invalid argument') ||
          errMsg.includes('unsupported image') ||
          errMsg.includes('image format') ||
          errMsg.includes('bad request') ||
          errMsg.includes('400') ||
          errMsg.includes('401') ||
          errMsg.includes('403') ||
          errMsg.includes('404');

        if (isClientError) {
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=client_error non-retryable duration=${duration}ms error="${lastErr.message}"`,
          );
          return {
            text: '',
            status: 'error',
            note: '',
            errorMessage: lastErr.message,
            isPermanentError: true,
          };
        }

        // E. Transient Server Error (500, 502, 503, 504, UNAVAILABLE)
        if (attempt < maxRetries) {
          const delayMs =
            (attempt === 0 ? 2000 : attempt === 1 ? 5000 : 10000) + Math.floor(Math.random() * 500);
          logger.warn(
            `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" status=server_error retry=${attempt + 1}/${maxRetries} backoff=${delayMs}ms error="${lastErr.message}"`,
          );
          await sleep(delayMs);
          continue;
        }

        logger.error(
          `[OCR] page="${pageLabel || 'unknown'}" model="${this.modelName}" failed after ${attempt + 1} attempts: ${lastErr.message}`,
        );
        return {
          text: '',
          status: 'error',
          note: '',
          errorMessage: lastErr.message,
        };
      }
    }

    return {
      text: '',
      status: 'error',
      note: '',
      errorMessage: `Gemini OCR failed on model ${this.modelName} after retries`,
    };
  }
}
