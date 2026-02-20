import { describe, it, expect } from 'vitest';
import {
  ApprovalState,
  MakerCheckerViolationError,
} from '@caricash/shared';
import type { ApprovalRequest } from '@caricash/shared';

/**
 * Pure logic tests for approval workflow validation.
 * The actual route handlers depend on D1/Hono, so we test the
 * validation rules and state transitions in isolation.
 */

function validateApproval(request: ApprovalRequest, staffId: string): { state: string } {
  if (request.state !== ApprovalState.PENDING) {
    throw new Error(`Request is already ${request.state}`);
  }
  if (request.maker_staff_id === staffId) {
    throw new MakerCheckerViolationError();
  }
  return { state: ApprovalState.APPROVED };
}

function validateRejection(request: ApprovalRequest, staffId: string): { state: string } {
  if (request.state !== ApprovalState.PENDING) {
    throw new Error(`Request is already ${request.state}`);
  }
  return { state: ApprovalState.REJECTED };
}

function makePendingRequest(makerId: string): ApprovalRequest {
  return {
    id: 'req-001',
    type: 'REVERSAL_REQUESTED',
    payload_json: '{}',
    maker_staff_id: makerId,
    state: ApprovalState.PENDING,
    created_at: '2025-01-01T00:00:00Z',
  };
}

describe('approval: maker-checker enforcement', () => {
  it('maker cannot approve their own request', () => {
    const request = makePendingRequest('staff-alice');
    expect(() => validateApproval(request, 'staff-alice')).toThrow(MakerCheckerViolationError);
  });

  it('different staff member can approve', () => {
    const request = makePendingRequest('staff-alice');
    const result = validateApproval(request, 'staff-bob');
    expect(result.state).toBe(ApprovalState.APPROVED);
  });
});

describe('approval: state transitions', () => {
  it('approve changes state to APPROVED', () => {
    const request = makePendingRequest('staff-alice');
    const result = validateApproval(request, 'staff-bob');
    expect(result.state).toBe('APPROVED');
  });

  it('reject changes state to REJECTED', () => {
    const request = makePendingRequest('staff-alice');
    const result = validateRejection(request, 'staff-bob');
    expect(result.state).toBe('REJECTED');
  });

  it('cannot approve a non-PENDING request (APPROVED)', () => {
    const request: ApprovalRequest = {
      ...makePendingRequest('staff-alice'),
      state: ApprovalState.APPROVED,
      checker_staff_id: 'staff-bob',
      decided_at: '2025-01-01T01:00:00Z',
    };
    expect(() => validateApproval(request, 'staff-charlie')).toThrow('Request is already APPROVED');
  });

  it('cannot approve a non-PENDING request (REJECTED)', () => {
    const request: ApprovalRequest = {
      ...makePendingRequest('staff-alice'),
      state: ApprovalState.REJECTED,
      checker_staff_id: 'staff-bob',
      decided_at: '2025-01-01T01:00:00Z',
    };
    expect(() => validateApproval(request, 'staff-charlie')).toThrow('Request is already REJECTED');
  });

  it('cannot reject a non-PENDING request', () => {
    const request: ApprovalRequest = {
      ...makePendingRequest('staff-alice'),
      state: ApprovalState.APPROVED,
    };
    expect(() => validateRejection(request, 'staff-bob')).toThrow('Request is already APPROVED');
  });
});
