import { logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors?: ((error: Error) => boolean)[];
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000, // BE-12: Increased from 30000ms to 60000ms for better rate limit handling
  backoffMultiplier: 2,
  retryableErrors: [
    (e) => e.message.includes('net::ERR_'),
    (e) => e.message.includes('timeout'),
    (e) => e.message.includes('ECONNRESET'),
    (e) => e.message.includes('ETIMEDOUT'),
    (e) => e.message.includes('Navigation failed'),
    (e) => e.message.includes('Target closed'),
    // BE-12: Rate limit detection
    (e) => e.message.includes('rate limit'),
    (e) => e.message.includes('429'),
    (e) => e.message.includes('Too Many Requests'),
    (e) => e.message.includes('bandwidth limit'),
  ],
};

// BE-11: Configurable rate limit settings
export interface RateLimitConfig {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  concurrentRequests: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  requestsPerSecond: 5,
  requestsPerMinute: 100,
  requestsPerHour: 1000,
  concurrentRequests: 3,
};

// Rate limit tracking state
const rateLimitState = {
  requestCounts: {
    second: 0,
    minute: 0,
    hour: 0,
  },
  lastSecondReset: Date.now(),
  lastMinuteReset: Date.now(),
  lastHourReset: Date.now(),
  activeRequests: 0,
};

/**
 * BE-11: Check if request should be throttled based on rate limits
 * Returns the delay needed before next request (0 = can proceed)
 */
export function getRateLimitDelay(config: Partial<RateLimitConfig> = {}): number {
  const cfg = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  const now = Date.now();

  // Reset counters if their window has passed
  if (now - rateLimitState.lastSecondReset >= 1000) {
    rateLimitState.requestCounts.second = 0;
    rateLimitState.lastSecondReset = now;
  }
  if (now - rateLimitState.lastMinuteReset >= 60000) {
    rateLimitState.requestCounts.minute = 0;
    rateLimitState.lastMinuteReset = now;
  }
  if (now - rateLimitState.lastHourReset >= 3600000) {
    rateLimitState.requestCounts.hour = 0;
    rateLimitState.lastHourReset = now;
  }

  // Check concurrent limit
  if (rateLimitState.activeRequests >= cfg.concurrentRequests) {
    return 100; // Wait for a slot
  }

  // Check per-second limit
  if (rateLimitState.requestCounts.second >= cfg.requestsPerSecond) {
    const timeToNextSecond = 1000 - (now - rateLimitState.lastSecondReset);
    return Math.max(timeToNextSecond, 50);
  }

  // Check per-minute limit
  if (rateLimitState.requestCounts.minute >= cfg.requestsPerMinute) {
    const timeToNextMinute = 60000 - (now - rateLimitState.lastMinuteReset);
    return Math.max(timeToNextMinute, 100);
  }

  // Check per-hour limit
  if (rateLimitState.requestCounts.hour >= cfg.requestsPerHour) {
    const timeToNextHour = 3600000 - (now - rateLimitState.lastHourReset);
    return Math.max(timeToNextHour, 500);
  }

  return 0;
}

/**
 * BE-11: Record that a request was made (call after request completes)
 */
export function recordRequest(): void {
  rateLimitState.requestCounts.second++;
  rateLimitState.requestCounts.minute++;
  rateLimitState.requestCounts.hour++;
}

/**
 * BE-11: Track active requests (for concurrent limiting)
 */
export function incrementActiveRequests(): void {
  rateLimitState.activeRequests++;
}

export function decrementActiveRequests(): void {
  if (rateLimitState.activeRequests > 0) {
    rateLimitState.activeRequests--;
  }
}

/**
 * BE-11: Get current rate limit status
 */
export function getRateLimitStatus(): {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  activeRequests: number;
  secondWindowResetsIn: number;
  minuteWindowResetsIn: number;
} {
  const now = Date.now();
  return {
    requestsPerSecond: rateLimitState.requestCounts.second,
    requestsPerMinute: rateLimitState.requestCounts.minute,
    requestsPerHour: rateLimitState.requestCounts.hour,
    activeRequests: rateLimitState.activeRequests,
    secondWindowResetsIn: Math.max(0, 1000 - (now - rateLimitState.lastSecondReset)),
    minuteWindowResetsIn: Math.max(0, 60000 - (now - rateLimitState.lastMinuteReset)),
  };
}

/**
 * BE-11: Apply rate limiting delay if needed, then execute the function
 */
export async function withRateLimit<T>(
  fn: () => Promise<T>,
  config: Partial<RateLimitConfig> = {}
): Promise<T> {
  const delay = getRateLimitDelay(config);
  
  if (delay > 0) {
    logger.debug(`Rate limit applied, waiting ${delay}ms`);
    await sleep(delay);
  }
  
  incrementActiveRequests();
  try {
    const result = await fn();
    recordRequest();
    return result;
  } finally {
    decrementActiveRequests();
  }
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  context: string = 'operation'
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRetryable = opts.retryableErrors?.some((check) => check(lastError!));

      if (!isRetryable && attempt < opts.maxAttempts) {
        logger.warn(`Non-retryable error in ${context}, attempt ${attempt}/${opts.maxAttempts}`, {
          error: lastError.message,
        });
      }

      if (attempt === opts.maxAttempts) {
        logger.error(`All ${opts.maxAttempts} attempts failed for ${context}`, {
          error: lastError.message,
        });
        throw lastError;
      }

      if (isRetryable || attempt < opts.maxAttempts) {
        logger.info(`Retrying ${context} in ${delay}ms (attempt ${attempt + 1}/${opts.maxAttempts})`, {
          error: lastError.message,
        });

        await sleep(delay);
        delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
      }
    }
  }

  throw lastError;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  context: string = 'operation'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

export class RetryableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function isRetryableError(error: Error, options?: Partial<RetryOptions>): boolean {
  const opts = options ?? DEFAULT_RETRY_OPTIONS;
  return opts.retryableErrors?.some((check) => check(error)) ?? false;
}
