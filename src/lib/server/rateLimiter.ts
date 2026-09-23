import { logger } from './logger.js';

export interface RateLimiterStatus {
  targetRpm: number;
  minIntervalMs: number;
  consecutive429Count: number;
  isPaused: boolean;
  pausedUntil: number;
  pausedRemainingSeconds: number;
}

export interface RateLimiterOptions {
  targetRpm?: number;
  circuitBreaker3xPauseSeconds?: number;
  circuitBreaker5xPauseSeconds?: number;
}

/**
 * Global In-Process Rate Limiter for Direct Realtime Gemini OCR requests.
 * Ensures conservative spacing between requests and circuit-breaker pausing upon 429 RESOURCE_EXHAUSTED.
 */
export class DirectOcrRateLimiter {
  private targetRpm: number;
  private minIntervalMs: number;
  private circuitBreaker3xPauseMs: number;
  private circuitBreaker5xPauseMs: number;

  private consecutive429Count: number = 0;
  private circuitBreakerPausedUntil: number = 0;
  private lastDispatchedTime: number = 0;
  private queuePromise: Promise<void> = Promise.resolve();

  constructor(options?: RateLimiterOptions) {
    const defaultRpm = parseInt(process.env.DIRECT_OCR_TARGET_RPM || '10', 10);
    this.targetRpm = options?.targetRpm || (isNaN(defaultRpm) || defaultRpm < 1 ? 10 : defaultRpm);
    this.minIntervalMs = Math.ceil(60000 / this.targetRpm);
    this.circuitBreaker3xPauseMs = (options?.circuitBreaker3xPauseSeconds || 60) * 1000;
    this.circuitBreaker5xPauseMs = (options?.circuitBreaker5xPauseSeconds || 180) * 1000;
  }

  public configure(options: RateLimiterOptions): void {
    if (options.targetRpm && options.targetRpm > 0) {
      this.targetRpm = options.targetRpm;
      this.minIntervalMs = Math.ceil(60000 / this.targetRpm);
    }
    if (options.circuitBreaker3xPauseSeconds) {
      this.circuitBreaker3xPauseMs = options.circuitBreaker3xPauseSeconds * 1000;
    }
    if (options.circuitBreaker5xPauseSeconds) {
      this.circuitBreaker5xPauseMs = options.circuitBreaker5xPauseSeconds * 1000;
    }
  }

  public getStatus(): RateLimiterStatus {
    const now = Date.now();
    const isPaused = now < this.circuitBreakerPausedUntil;
    const pausedRemainingSeconds = isPaused
      ? Math.max(0, Math.ceil((this.circuitBreakerPausedUntil - now) / 1000))
      : 0;

    return {
      targetRpm: this.targetRpm,
      minIntervalMs: this.minIntervalMs,
      consecutive429Count: this.consecutive429Count,
      isPaused,
      pausedUntil: this.circuitBreakerPausedUntil,
      pausedRemainingSeconds,
    };
  }

  /**
   * Reset rate limiter state (used in tests).
   */
  public reset(): void {
    this.consecutive429Count = 0;
    this.circuitBreakerPausedUntil = 0;
    this.lastDispatchedTime = 0;
    this.queuePromise = Promise.resolve();
  }

  /**
   * Acquire execution slot before making a Direct OCR request to Gemini.
   * Serializes all direct requests across all concurrent jobs and ensures minInterval spacing.
   */
  public async acquire(label?: string): Promise<void> {
    // Chain onto queue promise so requests are serialized FIFO
    const currentTicket = this.queuePromise.then(async () => {
      // 1. Check circuit breaker pause
      const now = Date.now();
      if (now < this.circuitBreakerPausedUntil) {
        const waitMs = this.circuitBreakerPausedUntil - now;
        logger.warn(
          `[RateLimiter] Direct OCR is paused due to rate limits (${this.consecutive429Count} consecutive 429s). Waiting ${Math.ceil(waitMs / 1000)}s before dispatching "${label || 'request'}"...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      // 2. Ensure minimum interval since last dispatch
      const timeSinceLast = Date.now() - this.lastDispatchedTime;
      if (this.lastDispatchedTime > 0 && timeSinceLast < this.minIntervalMs) {
        const intervalWait = this.minIntervalMs - timeSinceLast;
        await new Promise((resolve) => setTimeout(resolve, intervalWait));
      }

      this.lastDispatchedTime = Date.now();
    });

    // Update queuePromise for next callers
    this.queuePromise = currentTicket.catch(() => {});
    return currentTicket;
  }

  /**
   * Record a successful Gemini request to reset 429 counter.
   */
  public recordSuccess(label?: string): void {
    if (this.consecutive429Count > 0) {
      logger.info(
        `[RateLimiter] Request "${label || 'OCR'}" succeeded. Resetting consecutive 429 counter (was ${this.consecutive429Count}).`,
      );
    }
    this.consecutive429Count = 0;
  }

  /**
   * Record a 429 RESOURCE_EXHAUSTED rate limit error.
   */
  public recordRateLimit(retryAfterSeconds?: number, label?: string): void {
    this.consecutive429Count++;

    if (retryAfterSeconds && retryAfterSeconds > 0) {
      this.circuitBreakerPausedUntil = Math.max(
        this.circuitBreakerPausedUntil,
        Date.now() + retryAfterSeconds * 1000,
      );
      logger.warn(
        `[RateLimiter] 429 rate limit recorded for "${label || 'OCR'}" (retry-after: ${retryAfterSeconds}s, consecutive: ${this.consecutive429Count}). Pausing Direct OCR for ${retryAfterSeconds}s.`,
      );
      return;
    }

    if (this.consecutive429Count >= 5) {
      this.circuitBreakerPausedUntil = Math.max(
        this.circuitBreakerPausedUntil,
        Date.now() + this.circuitBreaker5xPauseMs,
      );
      logger.warn(
        `[RateLimiter] Circuit breaker level 2 tripped (${this.consecutive429Count} consecutive 429s). Pausing Direct OCR for ${Math.round(this.circuitBreaker5xPauseMs / 1000)}s.`,
      );
    } else if (this.consecutive429Count >= 3) {
      this.circuitBreakerPausedUntil = Math.max(
        this.circuitBreakerPausedUntil,
        Date.now() + this.circuitBreaker3xPauseMs,
      );
      logger.warn(
        `[RateLimiter] Circuit breaker level 1 tripped (3 consecutive 429s). Pausing Direct OCR for ${Math.round(this.circuitBreaker3xPauseMs / 1000)}s.`,
      );
    }
  }
}

export const directOcrRateLimiter = new DirectOcrRateLimiter();
