import { CircuitBreakerState } from './enums.js';
import type { CircuitBreakerConfig } from './types.js';

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitBreakerState;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export function createCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
  let state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  let failures: number[] = [];
  let halfOpenAttempts = 0;
  let lastFailureTime = 0;

  function recordFailure(): void {
    const now = Date.now();
    lastFailureTime = now;
    failures.push(now);
    // Trim failures outside the window
    const cutoff = now - config.window_ms;
    failures = failures.filter((t) => t > cutoff);
  }

  function shouldTrip(): boolean {
    const now = Date.now();
    const cutoff = now - config.window_ms;
    const recent = failures.filter((t) => t > cutoff);
    return recent.length >= config.failure_threshold;
  }

  function tripToOpen(): void {
    state = CircuitBreakerState.OPEN;
    halfOpenAttempts = 0;
  }

  function getState(): CircuitBreakerState {
    if (state === CircuitBreakerState.OPEN) {
      const elapsed = Date.now() - lastFailureTime;
      if (elapsed >= config.reset_timeout_ms) {
        state = CircuitBreakerState.HALF_OPEN;
        halfOpenAttempts = 0;
      }
    }
    return state;
  }

  async function execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = getState();

    if (current === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerOpenError();
    }

    if (current === CircuitBreakerState.HALF_OPEN) {
      if (halfOpenAttempts >= config.half_open_max_attempts) {
        tripToOpen();
        throw new CircuitBreakerOpenError();
      }
      halfOpenAttempts++;
    }

    try {
      const result = await fn();

      if (state === CircuitBreakerState.HALF_OPEN) {
        state = CircuitBreakerState.CLOSED;
        failures = [];
        halfOpenAttempts = 0;
      }

      return result;
    } catch (error) {
      recordFailure();

      if (state === CircuitBreakerState.HALF_OPEN) {
        tripToOpen();
      } else if (shouldTrip()) {
        tripToOpen();
      }

      throw error;
    }
  }

  return { execute, getState };
}
