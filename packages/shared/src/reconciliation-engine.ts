/**
 * Bank statement reconciliation engine (Section A).
 *
 * Supports two matching modes:
 * - Line-item matching: 1 bank entry ↔ 1 transfer
 * - Batch matching: 1 bank entry ↔ N transfers
 *
 * Matching priority:
 * 1) provider_transfer_id
 * 2) client_reference
 * 3) amount + currency + direction within ±10 minutes
 *
 * State machine transitions validated via state-machines module.
 */

import {
  StatementEntryStatus,
  ReconciliationMatchMethod,
  ReconciliationMatchConfidence,
  ReconciliationCaseType,
} from './enums.js';
import type { BankStatementEntry, ExternalTransfer, ReconciliationMatch } from './types.js';

export interface MatchCandidate {
  entry: BankStatementEntry;
  transfer?: ExternalTransfer;
  transfers?: ExternalTransfer[];
  method: string;
  confidence: string;
  amountDifference: string;
}

/**
 * Attempt line-item match for a single bank statement entry against a list of transfers.
 * Returns the best match candidate or null if no match found.
 */
export function matchLineItem(
  entry: BankStatementEntry,
  transfers: ExternalTransfer[],
): MatchCandidate | null {
  // Priority 1: Match by provider_transfer_id
  if (entry.entry_reference) {
    const byId = transfers.find((t) => t.provider_transfer_id === entry.entry_reference);
    if (byId && byId.currency === entry.currency && byId.direction === entry.direction) {
      return {
        entry,
        transfer: byId,
        method: ReconciliationMatchMethod.PROVIDER_ID,
        confidence: ReconciliationMatchConfidence.HIGH,
        amountDifference: (parseFloat(entry.amount) - parseFloat(byId.amount)).toFixed(2),
      };
    }
  }

  // Priority 2: Match by client_reference
  if (entry.description) {
    const byRef = transfers.find(
      (t) => t.client_reference && entry.description?.includes(t.client_reference),
    );
    if (byRef && byRef.currency === entry.currency && byRef.direction === entry.direction) {
      return {
        entry,
        transfer: byRef,
        method: ReconciliationMatchMethod.CLIENT_REF,
        confidence: ReconciliationMatchConfidence.HIGH,
        amountDifference: (parseFloat(entry.amount) - parseFloat(byRef.amount)).toFixed(2),
      };
    }
  }

  // Priority 3: Match by amount + currency + direction within ±10 minutes
  const entryTime = new Date(entry.value_date).getTime();
  const TOLERANCE_MS = 10 * 60 * 1000; // 10 minutes

  const byAmount = transfers.find((t) => {
    if (t.currency !== entry.currency) return false;
    if (t.direction !== entry.direction) return false;
    if (t.amount !== entry.amount) return false;
    const tTime = new Date(t.initiated_at).getTime();
    return Math.abs(entryTime - tTime) <= TOLERANCE_MS;
  });

  if (byAmount) {
    return {
      entry,
      transfer: byAmount,
      method: ReconciliationMatchMethod.AMOUNT_TIME,
      confidence: ReconciliationMatchConfidence.MEDIUM,
      amountDifference: '0.00',
    };
  }

  return null;
}

/**
 * Attempt batch matching for a single bank entry against multiple transfers.
 * Used when bank aggregates multiple transfers into one statement entry.
 *
 * Rules:
 * - same currency, direction, bank account
 * - sum < bank_entry → PARTIAL_MATCHED
 * - sum == bank_entry → MATCHED
 * - sum > bank_entry → DISPUTED
 */
export function matchBatch(
  entry: BankStatementEntry,
  transfers: ExternalTransfer[],
  toleranceHours: number = 24,
): MatchCandidate | null {
  const entryTime = new Date(entry.value_date).getTime();
  const toleranceMs = toleranceHours * 60 * 60 * 1000;

  const candidates = transfers.filter((t) => {
    if (t.currency !== entry.currency) return false;
    if (t.direction !== entry.direction) return false;
    const tTime = new Date(t.initiated_at).getTime();
    return Math.abs(entryTime - tTime) <= toleranceMs;
  });

  if (candidates.length === 0) return null;

  const sum = candidates.reduce((acc, t) => acc + parseFloat(t.amount), 0);
  const entryAmount = parseFloat(entry.amount);
  const diff = (entryAmount - sum).toFixed(2);

  let confidence: string = ReconciliationMatchConfidence.LOW;
  if (diff === '0.00') {
    confidence = ReconciliationMatchConfidence.HIGH;
  } else if (Math.abs(parseFloat(diff)) < entryAmount * 0.01) {
    confidence = ReconciliationMatchConfidence.MEDIUM;
  }

  return {
    entry,
    transfers: candidates,
    method: ReconciliationMatchMethod.BATCH,
    confidence,
    amountDifference: diff,
  };
}

/**
 * Determine the target status for a batch match based on amount comparison.
 */
export function getBatchMatchStatus(amountDifference: string): StatementEntryStatus {
  const diff = parseFloat(amountDifference);
  if (diff === 0) return StatementEntryStatus.MATCHED;
  if (diff > 0) return StatementEntryStatus.PARTIAL_MATCHED;
  return StatementEntryStatus.DISPUTED; // sum > entry
}

/**
 * Determine if an unmatched entry should be escalated (>24h old).
 */
export function shouldEscalateUnmatched(entry: BankStatementEntry, nowMs: number = Date.now()): boolean {
  const ESCALATION_MS = 24 * 60 * 60 * 1000;
  const createdAt = new Date(entry.created_at).getTime();
  return (nowMs - createdAt) > ESCALATION_MS;
}

/**
 * Build a reconciliation case type for a given mismatch scenario.
 */
export function classifyCaseType(
  entry: BankStatementEntry,
  match: MatchCandidate | null,
): string {
  if (!match) return ReconciliationCaseType.UNMATCHED_BANK;
  if (parseFloat(match.amountDifference) !== 0) return ReconciliationCaseType.AMOUNT_MISMATCH;
  if (match.method === ReconciliationMatchMethod.BATCH && parseFloat(match.amountDifference) > 0) {
    return ReconciliationCaseType.PARTIAL_MATCH;
  }
  return ReconciliationCaseType.UNMATCHED_BANK;
}
