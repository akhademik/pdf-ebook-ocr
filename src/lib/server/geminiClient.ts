import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';

export const DEFAULT_OCR_PROMPT = `Bạn là một công cụ OCR (Optical Character Recognition) chuyên nghiệp cho sách tiếng Việt scan.
Nhiệm vụ DUY NHẤT của bạn là trích xuất TOÀN BỘ văn bản xuất hiện trong ảnh được cung cấp.

TUYỆT ĐỐI TUÂN THỦ CÁC QUY TẮC SAU:
1. Trả về TRỰC TIẾP văn bản đã trích xuất. KHÔNG thêm lời chào, bình luận, mô tả ảnh, hay giải thích nào.
2. Giữ nguyên cấu trúc xuống dòng, đoạn văn, thứ tự đọc (trên xuống dưới, trái qua phải) như trong ảnh gốc.
3. Nội dung chính trong sách là TIẾNG VIỆT — trích xuất chính xác theo đúng chính tả tiếng Việt (đủ dấu thanh, đủ dấu phụ).
4. Nếu ảnh có ký tự bị mờ/không rõ, cố gắng suy luận từ ngữ cảnh xung quanh, không bỏ sót.
5. QUAN TRỌNG: Nếu trong văn bản xuất hiện các cụm từ/câu được giữ NGUYÊN VĂN bằng ngôn ngữ khác (không phải tiếng Việt) — có thể là tiếng Anh, Pháp, Đức, Latinh, Hy Lạp, Hebrew, Trung, Nhật, hoặc bất kỳ hệ chữ viết nào khác — PHẢI giữ nguyên chính xác cụm từ đó bằng đúng ngôn ngữ/hệ chữ gốc, KHÔNG dịch, KHÔNG phiên âm sang tiếng Việt.
6. Với các cụm ngoại ngữ này, hãy đặc biệt cẩn thận đọc đúng từng ký tự — nếu ảnh mờ nhưng bạn nhận ra đây là một từ/cụm từ có nghĩa trong ngôn ngữ đó, hãy sửa lại theo đúng chính tả chuẩn của ngôn ngữ gốc thay vì chép lại ký tự bị OCR sai.
7. Nếu trang ảnh trống hoặc không có chữ, trả về chuỗi rỗng.
8. Nếu trong ảnh có hình vẽ/tranh minh họa (không phải chữ viết), CHÈN marker [CÓ HÌNH] ngay tại vị trí hình đó xuất hiện trong luồng đọc, rồi tiếp tục trích xuất phần chữ còn lại (nếu có) phía sau. Nếu TOÀN BỘ trang chỉ là hình minh họa, không có chữ nào, trả về đúng: [CÓ HÌNH - TOÀN TRANG]
9. Nếu bạn không chắc chắn đã đọc đúng 100% một cụm từ ngoại ngữ (do ảnh mờ/nét chữ lạ), hãy bọc cụm đó trong dấu {{ }} để đánh dấu cần con người kiểm tra lại.
10. Nhận diện định dạng chữ theo kiểu Markdown: nếu đoạn/cụm từ được in ĐẬM (nét chữ dày, tối màu hơn xung quanh), bọc bằng **hai dấu sao** ở đầu và cuối, ví dụ **từ đậm**. Nếu được in NGHIÊNG (chữ xiên góc), bọc bằng *một dấu sao*, ví dụ *từ nghiêng*. Nếu vừa đậm vừa nghiêng, dùng ***ba dấu sao***. Chỉ đánh dấu khi thực sự nhìn rõ sự khác biệt về kiểu chữ so với văn bản thường xung quanh — không đoán bừa.

Đây là nhiệm vụ OCR thuần túy dựa trên hình ảnh được cung cấp. Chỉ trích xuất chính xác những gì bạn NHÌN THẤY trong ảnh, không dựa vào bất kỳ kiến thức hay trí nhớ nào có sẵn về nội dung văn bản này.`;

const RETRY_DELAYS = [1000, 4000, 10000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GeminiModelInfo {
  id: string;
  name: string;
  displayName: string;
  description?: string;
}

export const ALLOWED_FLASH_MODELS: GeminiModelInfo[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    displayName: 'Gemini 3.5 Flash Lite (Mặc định)',
    description: 'Thế hệ 3.5 Flash Lite tối ưu cao nhất cho tác vụ OCR',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    displayName: 'Gemini 3.1 Flash Lite (Fallback 1)',
    description: 'Thế hệ 3.1 Flash Lite',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    displayName: 'Gemini 2.5 Flash (Fallback 2)',
    description: 'Thế hệ 2.5 Flash',
  },
];

export class GeminiClient {
  private ai: GoogleGenAI;
  private apiKey: string;
  private modelName: string;
  private customPrompt: string = '';

  constructor(
    apiKey: string,
    modelName: string = 'gemini-3.5-flash-lite',
    customPrompt: string = '',
  ) {
    this.apiKey = apiKey.trim();
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    this.modelName = modelName.trim() || 'gemini-3.5-flash-lite';
    this.customPrompt = customPrompt.trim();
  }

  public getModelName(): string {
    return this.modelName;
  }

  public setModel(modelName: string): void {
    this.modelName = modelName.trim();
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

  /**
   * Chỉ trả về 3 model Flash được chọn (3.5, 3.1, 2.5)
   */
  async listFlashModels(): Promise<GeminiModelInfo[]> {
    return [...ALLOWED_FLASH_MODELS];
  }

  /**
   * Test kết nối API key với model hiện tại, tự động fallback theo thứ tự: 3.5 -> 3.1 -> 2.5 nếu cần.
   */
  async testConnection(): Promise<void> {
    const candidateOrder = [
      this.modelName,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ];

    const uniqueCandidates = [...new Set(candidateOrder)];
    let lastErr: Error | null = null;

    for (const modelId of uniqueCandidates) {
      try {
        const response = await this.ai.models.generateContent({
          model: modelId,
          contents: 'ping',
        });
        if (response && response.text) {
          if (this.modelName !== modelId) {
            logger.info(
              `Tự động chọn model hoạt động tốt nhất: ${modelId} (thay cho ${this.modelName})`,
            );
            this.modelName = modelId;
          }
          return;
        }
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        logger.warn(`Model ${modelId} test failed: ${lastErr.message}`);
      }
    }

    throw new Error(
      `Không thể kết nối Gemini API với các model Flash (3.5, 3.1, 2.5). Lỗi: ${lastErr?.message}`,
    );
  }

  /**
   * Perform OCR on an image with custom/default prompt and retry mechanism.
   */
  async performOcr(
    imageBase64: string,
    mimeType: string,
    overridePrompt?: string,
  ): Promise<string> {
    const promptToUse = overridePrompt || this.getPrompt();
    const fallbackModels = [
      this.modelName,
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ];
    const uniqueModels = [...new Set(fallbackModels)];

    let lastError: Error | null = null;

    for (const currentModel of uniqueModels) {
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          const response = await this.ai.models.generateContent({
            model: currentModel,
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

          const text = response.text || '';
          this.modelName = currentModel;
          return text.trim();
        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const errMsg = lastError.message.toLowerCase();
          const isNonRetryable =
            errMsg.includes('invalid_argument') ||
            errMsg.includes('invalid argument') ||
            errMsg.includes('unsupported image') ||
            errMsg.includes('image format') ||
            errMsg.includes('bad request') ||
            errMsg.includes('400');

          if (isNonRetryable) {
            logger.warn(
              `Gemini OCR non-retryable error on ${currentModel}: ${lastError.message}. Skipping retries.`,
            );
            break;
          }

          if (attempt < RETRY_DELAYS.length) {
            const isRateLimit =
              errMsg.includes('429') ||
              errMsg.includes('resource_exhausted') ||
              errMsg.includes('rate limit');
            const delay = isRateLimit ? RETRY_DELAYS[attempt] * 2 : RETRY_DELAYS[attempt];
            logger.warn(
              `Gemini OCR (${currentModel}) failed (attempt ${attempt + 1}). Retrying in ${delay}ms... Error: ${lastError.message}`,
            );
            await sleep(delay);
          }
        }
      }
      logger.warn(
        `Model ${currentModel} không thành công, thử model tiếp theo trong danh sách fallback...`,
      );
    }

    throw lastError || new Error('Gemini OCR failed on all 3 Flash models');
  }
}
