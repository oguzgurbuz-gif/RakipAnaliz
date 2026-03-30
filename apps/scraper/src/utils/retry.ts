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
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableErrors: [
    (e) => e.message.includes('net::ERR_'),
    (e) => e.message.includes('timeout'),
    (e) => e.message.includes('ECONNRESET'),
    (e) => e.message.includes('ETIMEDOUT'),
    (e) => e.message.includes('Navigation failed'),
    (e) => e.message.includes('Target closed'),
  ],
};

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
