/**
 * Decimal rounding utilities (Section W).
 *
 * BBD precision: 2 decimal places
 * Rounding mode: HALF_UP
 * Rounding remainder → ROUNDING_ADJUSTMENT account
 * Never allow fractional cent ledger entries.
 */

/** BBD decimal precision */
export const BBD_PRECISION = 2;

/** Settlement cutoff timezone (Section V) */
export const SETTLEMENT_TIMEZONE = 'America/Barbados';
export const SETTLEMENT_CUTOFF_HOUR = 17; // 17:00 AST

/**
 * Round a numeric string to BBD precision (2 decimal places) using HALF_UP rounding.
 * Returns a string with exactly 2 decimal places.
 */
export function roundHalfUp(value: string | number, precision: number = BBD_PRECISION): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(num)) {
    throw new RangeError(`Invalid numeric value: ${value}`);
  }
  // Use the factor-based rounding approach for HALF_UP
  const factor = Math.pow(10, precision);
  const rounded = Math.round(num * factor + Number.EPSILON) / factor;
  return rounded.toFixed(precision);
}

/**
 * Validates a monetary amount string has at most 2 decimal places (no fractional cents).
 */
export function isValidBBDAmount(amount: string): boolean {
  const match = amount.match(/^-?\d+(\.\d{1,2})?$/);
  return match !== null;
}

/**
 * Compute rounding adjustment: the difference between original sum and rounded sum.
 * Returns positive value if rounding increased the amount, negative if decreased.
 */
export function computeRoundingAdjustment(
  original: string | number,
  rounded: string | number,
): string {
  const origNum = typeof original === 'string' ? parseFloat(original) : original;
  const roundNum = typeof rounded === 'string' ? parseFloat(rounded) : rounded;
  const diff = roundNum - origNum;
  return roundHalfUp(diff);
}

/**
 * Get the next business day in AST timezone from a given date.
 * Saturday → Monday, Sunday → Monday.
 * Used for T+1 settlement calculations (Section V).
 */
export function getNextBusinessDayAST(date: Date = new Date()): string {
  // Convert to AST (UTC-4)
  const ast = new Date(date.getTime() - 4 * 60 * 60 * 1000);
  const day = ast.getUTCDay();
  let daysToAdd = 1;
  if (day === 5) daysToAdd = 3; // Friday → Monday
  if (day === 6) daysToAdd = 2; // Saturday → Monday
  const next = new Date(ast.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  return next.toISOString().split('T')[0];
}

/**
 * Check if current AST time is past settlement cutoff (17:00 AST).
 */
export function isPastSettlementCutoff(now: Date = new Date()): boolean {
  // AST = UTC - 4
  const astHour = (now.getUTCHours() - 4 + 24) % 24;
  return astHour >= SETTLEMENT_CUTOFF_HOUR;
}

/**
 * Circuit breaker default configuration (Section M).
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failure_threshold: 5,
  window_ms: 60_000,          // 60 seconds
  reset_timeout_ms: 120_000,  // 120 seconds
  half_open_max_attempts: 2,
} as const;

/**
 * Default retry configuration (Section M).
 */
export const DEFAULT_RETRY_CONFIG = {
  max_attempts: 5,
  base_delay_ms: 200,
  max_delay_ms: 4_000,       // capped at 4 seconds
  backoff_multiplier: 2,
} as const;

/**
 * Idempotency TTL constants in days (Section B).
 */
export const IDEMPOTENCY_TTL = {
  MONEY_TX: 30,
  BANK_TRANSFER: 90,
  WEBHOOK_DEDUPE: 180,
  OPS_CONFIG: 365,
} as const;
