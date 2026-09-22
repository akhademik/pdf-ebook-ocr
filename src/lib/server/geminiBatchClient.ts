import { logger } from './logger.js';
import type { BatchJobStatus } from '$lib/types/ocr.js';

export interface BatchItemInput {
  key: string;
  base64: string;
  mimeType: string;
}

export interface BatchItemResult {
  key: string;
  ocrText?: string;
  error?: string;
}

export interface GeminiBatchStatusResponse {
  batchId: string;
  state: BatchJobStatus;
  rawState?: string;
  outputUri?: string;
  errorMessage?: string;
  completedCount?: number;
  totalCount?: number;
}

export interface GeminiFileMetadata {
  name: string;
  displayName?: string;
  mimeType: string;
  sizeBytes: string;
  createTime?: string;
  updateTime?: string;
  expirationTime?: string;
  sha256Hash?: string;
  uri?: string;
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED' | 'STATE_UNSPECIFIED' | string;
  error?: { code?: number; message?: string };
}

export class GeminiBatchClient {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey.trim();
  }

  /**
   * Get metadata of an uploaded file in Gemini Files API
   */
  async getFileMetadata(fileName: string): Promise<GeminiFileMetadata> {
    const formattedName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
    const endpoint = `${this.baseUrl}/v1beta/${formattedName}?key=${this.apiKey}`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Failed to get file metadata for ${formattedName} (${res.status}): ${errText}`,
      );
    }

    return (await res.json()) as GeminiFileMetadata;
  }

  /**
   * Upload JSONL content via Google AI File API with MIME application/jsonl
   */
  async uploadJsonlFile(
    jsonlContent: string,
    fileName: string,
  ): Promise<{ fileName: string; metadata?: GeminiFileMetadata }> {
    const buffer = Buffer.from(jsonlContent, 'utf-8');
    const uploadUrl = `${this.baseUrl}/upload/v1beta/files?key=${this.apiKey}`;

    logger.info(
      `Uploading batch JSONL file "${fileName}" (${buffer.length} bytes) to Gemini Files API as application/jsonl...`,
    );

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': 'start, upload, finalize',
        'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
        'X-Goog-Upload-Header-Content-Type': 'application/jsonl',
        'Content-Type': 'application/jsonl',
      },
      body: buffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to upload batch JSONL file (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as { file?: { name: string; uri: string } };
    if (!data.file?.name) {
      throw new Error('Files API upload did not return a valid file name');
    }

    const uploadedName = data.file.name;
    logger.info(`Uploaded file successfully: ${uploadedName}`);

    // Verify file metadata & state
    let fileMeta: GeminiFileMetadata | undefined;
    try {
      fileMeta = await this.getFileMetadata(uploadedName);
      logger.info(
        `Gemini File metadata verified: ${JSON.stringify({
          name: fileMeta.name,
          displayName: fileMeta.displayName,
          mimeType: fileMeta.mimeType,
          sizeBytes: fileMeta.sizeBytes,
          state: fileMeta.state,
        })}`,
      );

      // If in PROCESSING state, wait briefly for ACTIVE
      if (fileMeta.state === 'PROCESSING') {
        logger.info(`File ${uploadedName} is PROCESSING, waiting for ACTIVE state...`);
        for (let poll = 0; poll < 5; poll++) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          fileMeta = await this.getFileMetadata(uploadedName);
          if (fileMeta.state === 'ACTIVE') {
            logger.info(`File ${uploadedName} became ACTIVE.`);
            break;
          }
        }
      }

      if (fileMeta.state === 'FAILED') {
        throw new Error(
          `Uploaded file entered FAILED state on Gemini: ${JSON.stringify(fileMeta.error || fileMeta)}`,
        );
      }
    } catch (metaErr) {
      logger.warn(`Could not verify metadata for ${uploadedName}:`, metaErr);
    }

    return { fileName: uploadedName, metadata: fileMeta };
  }

  /**
   * Submit a new batch job to Gemini Batch API
   */
  async submitBatchJob(
    modelName: string,
    items: BatchItemInput[],
    prompt: string,
    displayName?: string,
  ): Promise<{ batchId: string; totalImages: number }> {
    if (items.length === 0) {
      throw new Error('Cannot submit an empty batch');
    }

    // Build JSONL lines
    const lines = items.map((item) => {
      const entry = {
        key: item.key,
        request: {
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: item.mimeType || 'image/jpeg',
                    data: item.base64,
                  },
                },
              ],
            },
          ],
        },
      };
      return JSON.stringify(entry);
    });

    const jsonlContent = lines.join('\n');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `batch-${displayName || 'ocr'}-${timestamp}.jsonl`;

    // 1. Upload to Files API
    const { fileName: uploadedFileName, metadata: fileMeta } = await this.uploadJsonlFile(
      jsonlContent,
      fileName,
    );

    // 2. Create batch job
    const normalizedModel = modelName.startsWith('models/') ? modelName : `models/${modelName}`;
    const batchEndpoint = `${this.baseUrl}/v1beta/${normalizedModel}:batchGenerateContent?key=${this.apiKey}`;

    const payload = {
      batch: {
        display_name: displayName || `OCR Batch ${timestamp}`,
        input_config: {
          file_name: uploadedFileName,
        },
      },
    };

    logger.info(
      `Submitting batch job for model ${normalizedModel} with ${items.length} image(s)...`,
    );

    const res = await fetch(batchEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      const maskedEndpoint = batchEndpoint.replace(/key=[^&]+/, 'key=***');
      logger.error(`Failed to create Gemini Batch job (${res.status}): ${errText}`, {
        model: normalizedModel,
        uploadedFileName,
        uploadedFileMimeType: fileMeta?.mimeType,
        uploadedFileState: fileMeta?.state,
        uploadedFileSize: fileMeta?.sizeBytes,
        batchEndpoint: maskedEndpoint,
        batchPayload: payload,
      });
      throw new Error(`Failed to create Gemini Batch job (${res.status}): ${errText}`);
    }

    const jobData = (await res.json()) as { name?: string; id?: string };
    const batchId = jobData.name || jobData.id;

    if (!batchId) {
      throw new Error('Gemini Batch API did not return a valid batchId');
    }

    logger.info(`Batch job created successfully with ID: ${batchId}`);

    return {
      batchId,
      totalImages: items.length,
    };
  }

  /**
   * Check status of a batch job
   */
  async checkBatchStatus(batchId: string): Promise<GeminiBatchStatusResponse> {
    const formattedId = batchId.startsWith('batches/') ? batchId : `batches/${batchId}`;
    const endpoint = `${this.baseUrl}/v1beta/${formattedId}?key=${this.apiKey}`;

    const res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to get batch status (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      state?: string;
      error?: { message?: string };
      output_file?: string;
      outputUri?: string;
      dest?: { file_name?: string };
    };

    const rawState = data.state || 'JOB_STATE_UNSPECIFIED';
    let state: BatchJobStatus = 'pending';

    switch (rawState) {
      case 'JOB_STATE_SUCCEEDED':
      case 'SUCCEEDED':
      case 'COMPLETED':
        state = 'completed';
        break;
      case 'JOB_STATE_PARTIALLY_SUCCEEDED':
      case 'PARTIALLY_SUCCEEDED':
        state = 'partially_completed';
        break;
      case 'JOB_STATE_RUNNING':
      case 'RUNNING':
      case 'PROCESSING':
        state = 'running';
        break;
      case 'JOB_STATE_FAILED':
      case 'FAILED':
      case 'ERROR':
        state = 'failed';
        break;
      case 'JOB_STATE_CANCELLED':
      case 'JOB_STATE_EXPIRED':
      case 'EXPIRED':
        state = 'expired';
        break;
      case 'JOB_STATE_PENDING':
      case 'PENDING':
      case 'QUEUED':
      default:
        state = 'pending';
        break;
    }

    const outputUri = data.output_file || data.outputUri || data.dest?.file_name;
    const errorMessage = data.error?.message;

    return {
      batchId,
      state,
      rawState,
      outputUri,
      errorMessage,
    };
  }

  /**
   * Download and parse results of a completed batch job
   */
  async fetchBatchResults(
    batchId: string,
    outputFileUri?: string,
  ): Promise<Map<string, BatchItemResult>> {
    let fileUri = outputFileUri;

    if (!fileUri) {
      const status = await this.checkBatchStatus(batchId);
      fileUri = status.outputUri;
    }

    if (!fileUri) {
      throw new Error(`No output file URI available for completed batch ${batchId}`);
    }

    const downloadEndpoint = fileUri.startsWith('http')
      ? `${fileUri}?key=${this.apiKey}`
      : `${this.baseUrl}/v1beta/${fileUri}:content?key=${this.apiKey}`;

    logger.info(`Fetching batch results from ${fileUri}...`);

    const res = await fetch(downloadEndpoint);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to download batch results file (${res.status}): ${errText}`);
    }

    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const results = new Map<string, BatchItemResult>();

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as {
          key?: string;
          response?: {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };
          error?: { message?: string };
        };

        const key = parsed.key || '';
        if (!key) continue;

        if (parsed.error) {
          results.set(key, { key, error: parsed.error.message || 'Gemini processing error' });
          continue;
        }

        const candidate = parsed.response?.candidates?.[0];
        const extractedText = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';

        results.set(key, {
          key,
          ocrText: extractedText.trim(),
        });
      } catch (err: unknown) {
        logger.warn('Error parsing batch JSONL result line:', err);
      }
    }

    logger.info(`Parsed ${results.size} batch result items for batch ${batchId}.`);
    return results;
  }
}
