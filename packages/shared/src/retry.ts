import type { RetryConfig } from './types.js';

const PERMANENT_ERROR_NAMES = new Set([
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ValidationError',
  'AuthenticationError',
  'NotFoundError',
  'MakerCheckerViolationError',
]);

function isPermanentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return PERMANENT_ERROR_NAMES.has(error.name);
}

function computeDelay(attempt: number, config: RetryConfig): number {
  const exponential = config.base_delay_ms * Math.pow(config.backoff_multiplier, attempt);
  const capped = Math.min(exponential, config.max_delay_ms);
  // Add jitter: uniform random between 0 and capped delay
  const jitter = Math.random() * capped;
  return Math.floor(jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(fn: () => Promise<T>, config: RetryConfig): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < config.max_attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (isPermanentError(error)) {
        throw error;
      }

      const isLastAttempt = attempt === config.max_attempts - 1;
      if (isLastAttempt) break;

      const delay = computeDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError;
}
