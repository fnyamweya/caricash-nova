import type {
  CitibankTransferRequest,
  CitibankTransferResponse,
  CircuitBreakerConfig,
  RetryConfig,
} from './types.js';
import { createCircuitBreaker } from './circuit-breaker.js';
import { withRetry } from './retry.js';

export interface CitibankClientConfig {
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
}

export interface CitibankClient {
  initiateTransfer(
    req: CitibankTransferRequest,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<CitibankTransferResponse>;
  getTransferStatus(
    bankTransferId: string,
    correlationId?: string,
  ): Promise<CitibankTransferResponse>;
  getAccountBalance(
    accountId: string,
    correlationId?: string,
  ): Promise<{ account_id: string; balance: string; currency: string; as_of: string }>;
  getAccountStatement(
    accountId: string,
    from: string,
    to: string,
    cursor?: string,
    correlationId?: string,
  ): Promise<{ entries: CitibankTransferResponse[]; next_cursor?: string }>;
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failure_threshold: 5,
  window_ms: 60_000,
  reset_timeout_ms: 30_000,
  half_open_max_attempts: 2,
};

const DEFAULT_RETRY: RetryConfig = {
  max_attempts: 3,
  base_delay_ms: 250,
  max_delay_ms: 5_000,
  backoff_multiplier: 2,
};

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Citibank API error ${response.status}: ${body}`);
  }
}

export function createCitibankClient(config: CitibankClientConfig): CitibankClient {
  const cb = createCircuitBreaker(config.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER);
  const retryConfig = config.retry ?? DEFAULT_RETRY;

  function headers(correlationId?: string, idempotencyKey?: string): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': config.apiKey,
      'X-Correlation-ID': correlationId ?? generateId(),
    };
    if (idempotencyKey) {
      h['Idempotency-Key'] = idempotencyKey;
    }
    return h;
  }

  function call<T>(fn: () => Promise<T>): Promise<T> {
    return cb.execute(() => withRetry(fn, retryConfig));
  }

  async function initiateTransfer(
    req: CitibankTransferRequest,
    idempotencyKey: string,
    correlationId?: string,
  ): Promise<CitibankTransferResponse> {
    return call(async () => {
      const res = await fetch(`${config.baseUrl}/transfers`, {
        method: 'POST',
        headers: headers(correlationId, idempotencyKey),
        body: JSON.stringify(req),
      });
      await assertOk(res);
      return (await res.json()) as CitibankTransferResponse;
    });
  }

  async function getTransferStatus(
    bankTransferId: string,
    correlationId?: string,
  ): Promise<CitibankTransferResponse> {
    return call(async () => {
      const res = await fetch(`${config.baseUrl}/transfers/${bankTransferId}`, {
        method: 'GET',
        headers: headers(correlationId),
      });
      await assertOk(res);
      return (await res.json()) as CitibankTransferResponse;
    });
  }

  async function getAccountBalance(
    accountId: string,
    correlationId?: string,
  ): Promise<{ account_id: string; balance: string; currency: string; as_of: string }> {
    return call(async () => {
      const res = await fetch(`${config.baseUrl}/accounts/${accountId}/balance`, {
        method: 'GET',
        headers: headers(correlationId),
      });
      await assertOk(res);
      return (await res.json()) as {
        account_id: string;
        balance: string;
        currency: string;
        as_of: string;
      };
    });
  }

  async function getAccountStatement(
    accountId: string,
    from: string,
    to: string,
    cursor?: string,
    correlationId?: string,
  ): Promise<{ entries: CitibankTransferResponse[]; next_cursor?: string }> {
    return call(async () => {
      const url = new URL(`${config.baseUrl}/accounts/${accountId}/statement`);
      url.searchParams.set('from', from);
      url.searchParams.set('to', to);
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: headers(correlationId),
      });
      await assertOk(res);
      return (await res.json()) as {
        entries: CitibankTransferResponse[];
        next_cursor?: string;
      };
    });
  }

  return { initiateTransfer, getTransferStatus, getAccountBalance, getAccountStatement };
}
