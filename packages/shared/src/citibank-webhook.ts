import type { CitibankWebhookPayload } from './types.js';

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestampHeader: string,
): Promise<boolean> {
  const timestamp = Number(timestampHeader);
  if (Number.isNaN(timestamp)) return false;

  const age = Math.abs(Date.now() - timestamp);
  if (age > REPLAY_WINDOW_MS) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const message = `${timestampHeader}.${payload}`;
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const computed = bytesToHex(new Uint8Array(sig));

  return timingSafeEqual(computed, signature.toLowerCase());
}

export function parseWebhookPayload(body: string): CitibankWebhookPayload {
  return JSON.parse(body) as CitibankWebhookPayload;
}

export function computeWebhookIdempotencyKey(payload: CitibankWebhookPayload): string {
  return `${payload.bank_transfer_id}:${payload.status}`;
}
