import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
    useApi,
    PageTransition,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardFooter,
    Input,
    Label,
    Button,
    Badge,
    EmptyState,
} from '@caricash/ui';
import { ModulePage } from '../components/module-page.js';

interface ApprovalRecord {
    id: string;
    type: string;
    state: string;
    maker_staff_id: string;
    checker_staff_id?: string;
    created_at: string;
    decided_at?: string;
    payload?: Record<string, unknown> | null;
    payload_json?: string;
}

interface ApprovalListResponse {
    items: ApprovalRecord[];
    nextCursor: string | null;
}

interface ApprovalActionResponse {
    request_id: string;
    state: string;
    correlation_id?: string;
    [key: string]: unknown;
}

interface SuspenseFundResponse {
    request_id: string;
    state: string;
    approval_target_role: string;
    correlation_id?: string;
}

export function ApprovalsPage() {
    const api = useApi();
    const staffId = localStorage.getItem('caricash_staff_id') ?? '';

    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [typeFilter, setTypeFilter] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const [actionCorrelation, setActionCorrelation] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [actionResult, setActionResult] = useState<ApprovalActionResponse | null>(null);

    const [fundAmount, setFundAmount] = useState('');
    const [fundReason, setFundReason] = useState('');
    const [fundReference, setFundReference] = useState('');
    const [fundIdempotencyKey, setFundIdempotencyKey] = useState('');
    const [fundCorrelation, setFundCorrelation] = useState('');
    const [fundResult, setFundResult] = useState<SuspenseFundResponse | null>(null);

    const approvalsQuery = useQuery({
        queryKey: ['approvals', statusFilter, typeFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set('pageSize', '50');
            if (statusFilter) params.set('status', statusFilter);
            if (typeFilter) params.set('type', typeFilter);
            return api.get<ApprovalListResponse>(`/approvals?${params.toString()}`);
        },
    });

    const selectedRequest = useMemo(
        () => approvalsQuery.data?.items.find((item) => item.id === selectedId) ?? null,
        [approvalsQuery.data?.items, selectedId],
    );

    const availableTypes = useMemo(() => {
        const records = approvalsQuery.data?.items ?? [];
        return Array.from(new Set(records.map((item) => item.type))).sort();
    }, [approvalsQuery.data?.items]);

    const approveMutation = useMutation({
        mutationFn: async (requestId: string) => {
            return api.post<ApprovalActionResponse>(`/approvals/${requestId}/approve`, {
                staff_id: staffId,
                ...(actionCorrelation ? { correlation_id: actionCorrelation } : {}),
            });
        },
        onSuccess: async (res, requestId) => {
            setActionResult(res);
            setSelectedId(requestId);
            setActionCorrelation('');
            setRejectReason('');
            await approvalsQuery.refetch();
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (requestId: string) => {
            return api.post<ApprovalActionResponse>(`/approvals/${requestId}/reject`, {
                staff_id: staffId,
                reason: rejectReason,
                ...(actionCorrelation ? { correlation_id: actionCorrelation } : {}),
            });
        },
        onSuccess: async (res, requestId) => {
            setActionResult(res);
            setSelectedId(requestId);
            setActionCorrelation('');
            setRejectReason('');
            await approvalsQuery.refetch();
        },
    });

    const fundMutation = useMutation({
        mutationFn: async () => {
            return api.post<SuspenseFundResponse>('/ops/float/suspense/fund', {
                amount: fundAmount,
                currency: 'BBD',
                reason: fundReason,
                reference: fundReference || undefined,
                idempotency_key: fundIdempotencyKey,
                ...(fundCorrelation ? { correlation_id: fundCorrelation } : {}),
            });
        },
        onSuccess: (res) => {
            setFundResult(res);
            setFundAmount('');
            setFundReason('');
            setFundReference('');
            setFundIdempotencyKey('');
            setFundCorrelation('');
        },
    });

    const workingAction = approveMutation.isPending || rejectMutation.isPending;

    function formatType(value: string): string {
        return value
            .toLowerCase()
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    return (
        <PageTransition>
            <ModulePage
                module="Operations"
                title="Approval Management"
                description="Review, approve, reject, and request suspense funding with full traceability"
                playbook={[
                    'Use request IDs from verified workflow sources only.',
                    'Capture rejection reason and correlation IDs for audit evidence.',
                    'Submit suspense requests with unique idempotency keys.',
                ]}
            >
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Approval Queue</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-2">
                            {['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].map((status) => (
                                <Button
                                    key={status}
                                    size="sm"
                                    variant={statusFilter === status ? 'default' : 'outline'}
                                    onClick={() => {
                                        setStatusFilter(status);
                                        setSelectedId('');
                                    }}
                                >
                                    {status}
                                </Button>
                            ))}
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant={typeFilter === '' ? 'default' : 'outline'}
                                onClick={() => {
                                    setTypeFilter('');
                                    setSelectedId('');
                                }}
                            >
                                All Types
                            </Button>
                            {availableTypes.map((approvalType) => (
                                <Button
                                    key={approvalType}
                                    size="sm"
                                    variant={typeFilter === approvalType ? 'default' : 'outline'}
                                    onClick={() => {
                                        setTypeFilter(approvalType);
                                        setSelectedId('');
                                    }}
                                >
                                    {formatType(approvalType)}
                                </Button>
                            ))}
                        </div>

                        {approvalsQuery.isError && (
                            <p className="text-sm text-destructive">
                                {approvalsQuery.error?.message ?? 'Failed to load approvals.'}
                            </p>
                        )}

                        {!approvalsQuery.isFetching && (approvalsQuery.data?.items.length ?? 0) === 0 && (
                            <EmptyState title="No approvals found for selected filters" />
                        )}

                        <div className="flex flex-col gap-3">
                            {(approvalsQuery.data?.items ?? []).map((item) => {
                                const selected = selectedId === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={`rounded-md border p-3 text-left transition ${selected ? 'border-primary bg-muted/50' : 'border-border hover:bg-muted/30'}`}
                                        onClick={() => {
                                            setSelectedId(item.id);
                                            setActionResult(null);
                                        }}
                                    >
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{formatType(item.type)}</Badge>
                                            <Badge variant={item.state === 'PENDING' ? 'default' : 'secondary'}>{item.state}</Badge>
                                        </div>
                                        <p className="mt-2 text-sm font-medium">{item.id}</p>
                                        <p className="text-xs text-muted-foreground">Maker: {item.maker_staff_id}</p>
                                        <p className="text-xs text-muted-foreground">Created: {item.created_at}</p>
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Card className="max-w-2xl">
                    <CardHeader>
                        <CardTitle className="text-base">Maker-Checker Action</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {!selectedRequest && (
                            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                Select an approval request from the queue above to take action.
                            </div>
                        )}

                        {selectedRequest && (
                            <>
                                <div className="rounded-md bg-muted p-3 text-sm flex flex-col gap-1">
                                    <p><span className="font-medium">Request ID:</span> {selectedRequest.id}</p>
                                    <p><span className="font-medium">Type:</span> {formatType(selectedRequest.type)}</p>
                                    <p><span className="font-medium">State:</span> {selectedRequest.state}</p>
                                    <p><span className="font-medium">Maker Staff ID:</span> {selectedRequest.maker_staff_id}</p>
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="action-corr">Correlation ID (optional)</Label>
                                    <Input
                                        id="action-corr"
                                        type="text"
                                        placeholder="Optional correlation ID"
                                        value={actionCorrelation}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionCorrelation(e.target.value)}
                                    />
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="reject-reason">Reject Reason</Label>
                                    <Input
                                        id="reject-reason"
                                        type="text"
                                        placeholder="Required only for reject"
                                        value={rejectReason}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                                    />
                                </div>

                                {approveMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {approveMutation.error?.message ?? 'Approval failed.'}
                                    </p>
                                )}

                                {rejectMutation.isError && (
                                    <p className="text-sm text-destructive">
                                        {rejectMutation.error?.message ?? 'Rejection failed.'}
                                    </p>
                                )}

                                {actionResult && (
                                    <div className={`rounded-md p-3 text-sm flex items-center gap-2 ${actionResult.state === 'APPROVED' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                                        {actionResult.state === 'APPROVED' ? (
                                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        )}
                                        <span>
                                            Updated request <span className="font-medium">{actionResult.request_id}</span> to{' '}
                                            <span className="font-medium">{actionResult.state}</span>
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </CardContent>
                    <CardFooter className="gap-2">
                        <Button
                            type="button"
                            className="flex-1"
                            disabled={!selectedRequest || !staffId || workingAction || selectedRequest?.state !== 'PENDING'}
                            onClick={() => {
                                if (!selectedRequest) return;
                                approveMutation.mutate(selectedRequest.id);
                            }}
                        >
                            {approveMutation.isPending ? 'Approving…' : 'Approve'}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            className="flex-1"
                            disabled={!selectedRequest || !staffId || workingAction || !rejectReason || selectedRequest?.state !== 'PENDING'}
                            onClick={() => {
                                if (!selectedRequest) return;
                                rejectMutation.mutate(selectedRequest.id);
                            }}
                        >
                            {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                        </Button>
                    </CardFooter>
                </Card>

                <Card className="max-w-2xl">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            fundMutation.mutate();
                        }}
                    >
                        <CardHeader>
                            <CardTitle className="text-base">Request Suspense Funding</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fund-amount">Amount (BBD)</Label>
                                <Input id="fund-amount" type="text" placeholder="e.g. 5000.00" value={fundAmount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFundAmount(e.target.value)} required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fund-reason">Reason</Label>
                                <Input id="fund-reason" type="text" placeholder="Treasury funding reason" value={fundReason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFundReason(e.target.value)} required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fund-reference">Reference (optional)</Label>
                                <Input id="fund-reference" type="text" placeholder="External settlement reference" value={fundReference} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFundReference(e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fund-idempotency">Idempotency Key</Label>
                                <Input id="fund-idempotency" type="text" placeholder="Unique request key" value={fundIdempotencyKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFundIdempotencyKey(e.target.value)} required />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="fund-corr">Correlation ID (optional)</Label>
                                <Input id="fund-corr" type="text" placeholder="Optional correlation ID" value={fundCorrelation} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFundCorrelation(e.target.value)} />
                            </div>
                            {fundMutation.isError && (
                                <p className="text-sm text-destructive">{fundMutation.error?.message ?? 'Suspense funding request failed.'}</p>
                            )}
                            {fundResult && (
                                <div className="rounded-md bg-green-500/10 p-3 text-sm flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                    <span>
                                        Request created: <span className="font-medium">{fundResult.request_id}</span> ({fundResult.state})
                                    </span>
                                </div>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button type="submit" className="w-full" disabled={fundMutation.isPending || !staffId || !fundAmount || !fundReason || !fundIdempotencyKey}>
                                {fundMutation.isPending ? 'Submitting…' : 'Submit Funding Request'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                {!staffId && (
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                            <p className="text-sm text-muted-foreground">
                                Staff identity is missing. Sign in again before taking approval actions.
                            </p>
                        </CardContent>
                    </Card>
                )}
            </ModulePage>
        </PageTransition>
    );
}
