import { describe, it, expect } from 'vitest';
import { ErrorCode } from '../index.js';

describe('ErrorCode enum', () => {
  it('contains all required ledger error codes', () => {
    expect(ErrorCode.INSUFFICIENT_FUNDS).toBe('INSUFFICIENT_FUNDS');
    expect(ErrorCode.CROSS_CURRENCY_NOT_ALLOWED).toBe('CROSS_CURRENCY_NOT_ALLOWED');
    expect(ErrorCode.UNBALANCED_JOURNAL).toBe('UNBALANCED_JOURNAL');
    expect(ErrorCode.DUPLICATE_IDEMPOTENCY_CONFLICT).toBe('DUPLICATE_IDEMPOTENCY_CONFLICT');
  });

  it('contains all required governance error codes', () => {
    expect(ErrorCode.MAKER_CHECKER_REQUIRED).toBe('MAKER_CHECKER_REQUIRED');
    expect(ErrorCode.MAKER_CHECKER_VIOLATION).toBe('MAKER_CHECKER_VIOLATION');
  });

  it('contains all required auth error codes', () => {
    expect(ErrorCode.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
    expect(ErrorCode.ACCOUNT_LOCKED).toBe('ACCOUNT_LOCKED');
    expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
    expect(ErrorCode.UNAUTHORIZED).toBe('UNAUTHORIZED');
  });

  it('contains reconciliation error codes', () => {
    expect(ErrorCode.RECONCILIATION_MISMATCH).toBe('RECONCILIATION_MISMATCH');
    expect(ErrorCode.INTEGRITY_VIOLATION).toBe('INTEGRITY_VIOLATION');
    expect(ErrorCode.REPAIR_FAILED).toBe('REPAIR_FAILED');
  });
});
