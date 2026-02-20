import { UnbalancedJournalError } from './errors.js';

const CROCKFORD32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time: number): string {
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD32[time % 32] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  let out = '';
  let buffer = 0;
  let bitsInBuffer = 0;

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 5) {
      const index = (buffer >> (bitsInBuffer - 5)) & 31;
      out += CROCKFORD32[index];
      bitsInBuffer -= 5;
    }
  }

  if (bitsInBuffer > 0) {
    const index = (buffer << (5 - bitsInBuffer)) & 31;
    out += CROCKFORD32[index];
  }

  return out.slice(0, 16);
}

export function generateId(): string {
  const timePart = encodeTime(Date.now());
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  const randomPart = encodeRandom(randomBytes);
  return `${timePart}${randomPart}`;
}

export function assertBalanced(entries: { entry_type: 'DR' | 'CR'; amount: string }[]): void {
  let drTotal = 0n;
  let crTotal = 0n;
  for (const e of entries) {
    const cents = parseAmount(e.amount);
    if (e.entry_type === 'DR') drTotal += cents;
    else crTotal += cents;
  }
  if (drTotal !== crTotal) {
    throw new UnbalancedJournalError();
  }
}

/** Parses a decimal string (up to 2 decimal places) into bigint cents. */
export function parseAmount(s: string): bigint {
  const trimmed = s.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error(`Invalid amount format: "${s}"`);
  }
  const [whole, frac = ''] = trimmed.split('.');
  const cents = frac.padEnd(2, '0');
  return BigInt(whole + cents);
}

/** Formats bigint cents back to a decimal string with 2 decimal places. */
export function formatAmount(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const str = abs.toString().padStart(3, '0');
  const whole = str.slice(0, -2);
  const frac = str.slice(-2);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Compute a SHA-256 hex digest of the input string.
 * Works in both Cloudflare Workers and Node.js (via globalThis.crypto).
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute the scope hash for idempotency:
 * SHA-256(initiator_actor_type + ":" + initiator_actor_id + ":" + txn_type + ":" + idempotency_key)
 */
export async function computeScopeHash(
  initiatorActorType: string,
  initiatorActorId: string,
  txnType: string,
  idempotencyKey: string,
): Promise<string> {
  return sha256Hex(`${initiatorActorType}:${initiatorActorId}:${txnType}:${idempotencyKey}`);
}

/**
 * Compute a payload hash for conflict detection.
 * Canonical JSON serialization ensures deterministic key ordering.
 */
export async function computePayloadHash(payload: Record<string, unknown>): Promise<string> {
  const canonical = canonicalStringify(payload);
  return sha256Hex(canonical);
}

/** Recursively sorts object keys for deterministic JSON output. */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}
