/**
 * PIN hashing using Web Crypto PBKDF2 with SHA-256.
 * scrypt is not available in Cloudflare Workers.
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes

function hexEncode(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin: string, salt: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin + pepper),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  return hexEncode(bits);
}

export async function verifyPin(
  pin: string,
  salt: string,
  pepper: string,
  hash: string,
): Promise<boolean> {
  const computed = await hashPin(pin, salt, pepper);
  // Constant-time comparison via subtle crypto digest
  if (computed.length !== hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hexEncode(bytes.buffer);
}
