import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectOcrRateLimiter } from '../src/lib/server/rateLimiter.js';

describe('DirectOcrRateLimiter', () => {
  let limiter: DirectOcrRateLimiter;

  beforeEach(() => {
    limiter = new DirectOcrRateLimiter({
      targetRpm: 60, // 60 RPM -> 1000ms minIntervalMs for fast test execution
      circuitBreaker3xPauseSeconds: 2,
      circuitBreaker5xPauseSeconds: 5,
    });
  });

  it('should space requests according to target RPM and minIntervalMs', async () => {
    const start = Date.now();
    await limiter.acquire('req1');
    const firstElapsed = Date.now() - start;
    expect(firstElapsed).toBeLessThan(100);

    const secondStart = Date.now();
    await limiter.acquire('req2');
    const secondElapsed = Date.now() - secondStart;
    // Should wait ~1000ms since minInterval is 1000ms
    expect(secondElapsed).toBeGreaterThanOrEqual(900);
  });

  it('should serialize multiple callers in FIFO queue without creating bursts', async () => {
    const order: string[] = [];

    const call1 = limiter.acquire('JobA').then(() => {
      order.push('JobA');
    });
    const call2 = limiter.acquire('JobB').then(() => {
      order.push('JobB');
    });
    const call3 = limiter.acquire('JobC').then(() => {
      order.push('JobC');
    });

    await Promise.all([call1, call2, call3]);
    expect(order).toEqual(['JobA', 'JobB', 'JobC']);
  });

  it('should pause on 429 when retry-after is provided', async () => {
    limiter.recordRateLimit(2, 'TestJob');
    const status = limiter.getStatus();
    expect(status.isPaused).toBe(true);
    expect(status.consecutive429Count).toBe(1);
    expect(status.pausedRemainingSeconds).toBeGreaterThanOrEqual(1);

    const start = Date.now();
    await limiter.acquire('NextJob');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(1900);
  });

  it('should trip circuit breaker after 3 and 5 consecutive 429 errors', async () => {
    limiter.recordRateLimit(undefined, 'Job1');
    expect(limiter.getStatus().consecutive429Count).toBe(1);
    expect(limiter.getStatus().isPaused).toBe(false);

    limiter.recordRateLimit(undefined, 'Job2');
    expect(limiter.getStatus().consecutive429Count).toBe(2);
    expect(limiter.getStatus().isPaused).toBe(false);

    // 3rd 429 -> Circuit breaker level 1 (2s in test config)
    limiter.recordRateLimit(undefined, 'Job3');
    expect(limiter.getStatus().consecutive429Count).toBe(3);
    expect(limiter.getStatus().isPaused).toBe(true);

    // 4th 429
    limiter.recordRateLimit(undefined, 'Job4');
    expect(limiter.getStatus().consecutive429Count).toBe(4);

    // 5th 429 -> Circuit breaker level 2 (5s in test config)
    limiter.recordRateLimit(undefined, 'Job5');
    expect(limiter.getStatus().consecutive429Count).toBe(5);
    expect(limiter.getStatus().isPaused).toBe(true);
  });

  it('should reset consecutive 429 counter when a request succeeds', async () => {
    limiter.recordRateLimit(undefined, 'Job1');
    limiter.recordRateLimit(undefined, 'Job2');
    expect(limiter.getStatus().consecutive429Count).toBe(2);

    limiter.recordSuccess('Job3');
    expect(limiter.getStatus().consecutive429Count).toBe(0);
  });
});
