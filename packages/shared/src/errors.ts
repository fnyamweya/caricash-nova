import type { ZodError } from 'zod';

export class InsufficientFundsError extends Error {
  constructor(message = 'Insufficient funds') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

export class CrossCurrencyError extends Error {
  constructor(message = 'Cross-currency postings are not permitted') {
    super(message);
    this.name = 'CrossCurrencyError';
  }
}

export class UnbalancedJournalError extends Error {
  constructor(message = 'Journal entries do not balance (sum DR ≠ sum CR)') {
    super(message);
    this.name = 'UnbalancedJournalError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor(message = 'Idempotency key conflict') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export class MakerCheckerViolationError extends Error {
  constructor(message = 'Maker cannot approve their own request') {
    super(message);
    this.name = 'MakerCheckerViolationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  public readonly issues: ZodError['issues'];
  constructor(zodError: ZodError) {
    super(`Validation failed: ${zodError.message}`);
    this.name = 'ValidationError';
    this.issues = zodError.issues;
  }
}
