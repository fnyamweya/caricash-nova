import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import {
    useApi,
    ApiError,
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
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
    policy_id?: string | null;
    current_stage?: number;
    total_stages?: number;
    workflow_state?: string | null;
}

interface ApprovalListResponse {
    items: ApprovalRecord[];
    nextCursor: string | null;
}

interface ApprovalTypeInfo {
    type: string;
    label: string;
    allowed_checker_roles: string[];
    has_approve_handler: boolean;
    has_reject_handler: boolean;
    source: string;
}

interface ApprovalTypesResponse {
    types: ApprovalTypeInfo[];
}

interface PolicyStageDecision {
    stage_no: number;
    decision: string;
    decider_id: string;
    decider_role?: string;
    reason?: string;
    decided_at: string;
}

interface PolicyDecisionResponse {
    request_id: string;
    request_type: string;
    request_state: string;
    policy_id: string | null;
    current_stage: number;
    total_stages: number;
    workflow_state?: string | null;
    stage_decisions: PolicyStageDecision[];
}

interface ApprovalPolicy {
    id: string;
    name: string;
    description?: string;
    approval_type?: string;
    state: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
    priority: number;
    version: number;
    created_at: string;
}

interface ApprovalPolicyStage {
    stage_no: number;
    min_approvals: number;
}

interface ApprovalPolicyFull extends ApprovalPolicy {
    stages: ApprovalPolicyStage[];
}

interface ApprovalPoliciesResponse {
    items: ApprovalPolicy[];
    count: number;
}

interface CreatePolicyPayload {
    name: string;
    description?: string;
    approval_type?: string;
    priority?: number;
    staff_id: string;
}

interface UpdatePolicyPayload {
    policyId: string;
    name?: string;
    description?: string;
    approval_type?: string;
    priority?: number;
    staff_id: string;
}

interface ApprovalPolicyActionResponse {
    policy_id: string;
    state: string;
    version?: number;
}

interface ApprovalDelegation {
    id: string;
    delegator_id: string;
    delegate_id: string;
    approval_type?: string;
    valid_from: string;
    valid_to: string;
    state: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    reason?: string;
}

interface ApprovalDelegationsResponse {
    items: ApprovalDelegation[];
    count: number;
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

    const [tab, setTab] = useState('queue');
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

    const [delegatorId, setDelegatorId] = useState('');
    const [delegateId, setDelegateId] = useState('');
    const [delegationType, setDelegationType] = useState('');
    const [delegationReason, setDelegationReason] = useState('');
    const [delegationValidFrom, setDelegationValidFrom] = useState('');
    const [delegationValidTo, setDelegationValidTo] = useState('');
    const [delegationStateFilter, setDelegationStateFilter] = useState('ACTIVE');

    const [policyName, setPolicyName] = useState('');
    const [policyDescription, setPolicyDescription] = useState('');
    const [policyApprovalType, setPolicyApprovalType] = useState('');
    const [policyPriority, setPolicyPriority] = useState('100');

    const [editingPolicyId, setEditingPolicyId] = useState('');
    const [editPolicyName, setEditPolicyName] = useState('');
    const [editPolicyDescription, setEditPolicyDescription] = useState('');
    const [editPolicyApprovalType, setEditPolicyApprovalType] = useState('');
    const [editPolicyPriority, setEditPolicyPriority] = useState('100');

    const approvalTypesQuery = useQuery({
        queryKey: ['approval-types'],
        queryFn: () => api.get<ApprovalTypesResponse>('/approvals/types'),
    });

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

    const selectedApprovalDetailQuery = useQuery({
        queryKey: ['approval-detail', selectedId],
        queryFn: () => api.get<ApprovalRecord>(`/approvals/${encodeURIComponent(selectedId)}`),
        enabled: !!selectedId,
    });

    const selectedPolicyDecisionQuery = useQuery({
        queryKey: ['approval-policy-decision', selectedId],
        queryFn: () => api.get<PolicyDecisionResponse>(`/approvals/policies/requests/${encodeURIComponent(selectedId)}/policy-decision`),
        enabled: !!selectedId,
    });

    const policiesQuery = useQuery({
        queryKey: ['approval-policies'],
        queryFn: () => api.get<ApprovalPoliciesResponse>('/approvals/policies?limit=100'),
    });

    const delegationsQuery = useQuery({
        queryKey: ['approval-delegations', delegationStateFilter],
        queryFn: () => {
            const params = new URLSearchParams();
            if (delegationStateFilter) params.set('state', delegationStateFilter);
            return api.get<ApprovalDelegationsResponse>(`/approvals/delegations?${params.toString()}`);
        },
    });

    const policiesEndpointUnavailable =
        policiesQuery.isError && policiesQuery.error instanceof ApiError && policiesQuery.error.status === 404;

    const delegationsEndpointUnavailable =
        delegationsQuery.isError && delegationsQuery.error instanceof ApiError && delegationsQuery.error.status === 404;

    const selectedRequest = useMemo(
        () => approvalsQuery.data?.items.find((item) => item.id === selectedId) ?? null,
        [approvalsQuery.data?.items, selectedId],
    );

    const availableTypes = useMemo(() => {
        const registryTypes = approvalTypesQuery.data?.types.map((item) => item.type) ?? [];
        const queueTypes = approvalsQuery.data?.items.map((item) => item.type) ?? [];
        return Array.from(new Set([...registryTypes, ...queueTypes])).sort();
    }, [approvalTypesQuery.data?.types, approvalsQuery.data?.items]);

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

    const policyActionMutation = useMutation({
        mutationFn: async (payload: { policyId: string; action: 'activate' | 'deactivate' }) => {
            return api.post<ApprovalPolicyActionResponse>(`/approvals/policies/${encodeURIComponent(payload.policyId)}/${payload.action}`, {
                staff_id: staffId,
            });
        },
        onSuccess: async () => {
            await policiesQuery.refetch();
        },
    });

    const createPolicyMutation = useMutation({
        mutationFn: async (payload: CreatePolicyPayload) => {
            return api.post<ApprovalPolicyFull>('/approvals/policies', payload);
        },
        onSuccess: async () => {
            setPolicyName('');
            setPolicyDescription('');
            setPolicyApprovalType('');
            setPolicyPriority('100');
            await policiesQuery.refetch();
        },
    });

    const updatePolicyMutation = useMutation({
        mutationFn: async (payload: UpdatePolicyPayload) => {
            const { policyId, ...body } = payload;
            return api.patch<ApprovalPolicyFull>(`/approvals/policies/${encodeURIComponent(policyId)}`, body);
        },
        onSuccess: async () => {
            await policiesQuery.refetch();
        },
    });

    const deletePolicyMutation = useMutation({
        mutationFn: async (policyId: string) => {
            return api.delete<{ deleted: boolean; policy_id: string }>(`/approvals/policies/${encodeURIComponent(policyId)}`);
        },
        onSuccess: async () => {
            if (editingPolicyId) {
                setEditingPolicyId('');
                setEditPolicyName('');
                setEditPolicyDescription('');
                setEditPolicyApprovalType('');
                setEditPolicyPriority('100');
            }
            await policiesQuery.refetch();
        },
    });

    const createDelegationMutation = useMutation({
        mutationFn: async () => {
            const validFrom = new Date(delegationValidFrom).toISOString();
            const validTo = new Date(delegationValidTo).toISOString();
            return api.post<ApprovalDelegation>('/approvals/delegations', {
                delegator_id: delegatorId,
                delegate_id: delegateId,
                approval_type: delegationType || undefined,
                valid_from: validFrom,
                valid_to: validTo,
                reason: delegationReason || undefined,
                staff_id: staffId,
            });
        },
        onSuccess: async () => {
            setDelegatorId('');
            setDelegateId('');
            setDelegationType('');
            setDelegationReason('');
            setDelegationValidFrom('');
            setDelegationValidTo('');
            await delegationsQuery.refetch();
        },
    });

    const revokeDelegationMutation = useMutation({
        mutationFn: async (delegationId: string) => {
            return api.post<{ id: string; state: string }>(`/approvals/delegations/${encodeURIComponent(delegationId)}/revoke`, {
                staff_id: staffId,
            });
        },
        onSuccess: async () => {
            await delegationsQuery.refetch();
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
                description="Maker-checker operations across approval queue, policy controls, delegations, and suspense funding"
                playbook={[
                    'Approve only when checker role and stage requirements are satisfied.',
                    'Use policy state controls (activate/deactivate) for safe workflow rollout.',
                    'Keep delegation windows explicit with valid from/to timestamps.',
                ]}
            >
                <Tabs value={tab} onValueChange={setTab}>
                    <TabsList>
                        <TabsTrigger value="queue">Queue</TabsTrigger>
                        <TabsTrigger value="policies">Policies</TabsTrigger>
                        <TabsTrigger value="delegations">Delegations</TabsTrigger>
                        <TabsTrigger value="funding">Funding</TabsTrigger>
                    </TabsList>

                    <TabsContent value="queue" className="mt-4 space-y-6">
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

                                <div className="w-full max-w-sm">
                                    <Label className="text-xs text-muted-foreground">Approval Type</Label>
                                    <Select
                                        value={typeFilter || '__all__'}
                                        onValueChange={(value) => {
                                            setTypeFilter(value === '__all__' ? '' : value);
                                            setSelectedId('');
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="All Types" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">All Types</SelectItem>
                                            {availableTypes.map((approvalType) => (
                                                <SelectItem key={approvalType} value={approvalType}>
                                                    {formatType(approvalType)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
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
                                                    {item.policy_id && (
                                                        <Badge variant="outline">
                                                            Stage {item.current_stage ?? 1}/{item.total_stages ?? 1}
                                                        </Badge>
                                                    )}
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

                        <Card className="max-w-4xl">
                            <CardHeader>
                                <CardTitle className="text-base">Request Detail & Action</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                {!selectedRequest && (
                                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                        Select an approval request from the queue above to inspect stage state and take action.
                                    </div>
                                )}

                                {selectedRequest && (
                                    <>
                                        <div className="grid gap-3 sm:grid-cols-2 rounded-md bg-muted p-3 text-sm">
                                            <p><span className="font-medium">Request ID:</span> {selectedRequest.id}</p>
                                            <p><span className="font-medium">Type:</span> {formatType(selectedRequest.type)}</p>
                                            <p><span className="font-medium">State:</span> {selectedRequest.state}</p>
                                            <p><span className="font-medium">Maker Staff ID:</span> {selectedRequest.maker_staff_id}</p>
                                            <p><span className="font-medium">Policy ID:</span> {selectedRequest.policy_id ?? 'Legacy workflow'}</p>
                                            <p><span className="font-medium">Workflow:</span> {selectedRequest.workflow_state ?? 'LEGACY'}</p>
                                        </div>

                                        {selectedPolicyDecisionQuery.data && (
                                            <div className="rounded-md border p-3 text-sm space-y-2">
                                                <p className="font-medium">Stage Decisions</p>
                                                <p className="text-muted-foreground">
                                                    Current Stage {selectedPolicyDecisionQuery.data.current_stage}/{selectedPolicyDecisionQuery.data.total_stages}
                                                    {' • '}
                                                    Workflow {selectedPolicyDecisionQuery.data.workflow_state ?? 'N/A'}
                                                </p>
                                                {(selectedPolicyDecisionQuery.data.stage_decisions ?? []).length === 0 ? (
                                                    <p className="text-muted-foreground">No stage decisions recorded yet.</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {selectedPolicyDecisionQuery.data.stage_decisions.map((decision, idx) => (
                                                            <div key={`${decision.stage_no}-${decision.decider_id}-${idx}`} className="rounded border p-2">
                                                                <p className="font-medium">Stage {decision.stage_no}: {decision.decision}</p>
                                                                <p className="text-muted-foreground">Decider {decision.decider_id}{decision.decider_role ? ` (${decision.decider_role})` : ''}</p>
                                                                {decision.reason && <p className="text-muted-foreground">Reason: {decision.reason}</p>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {selectedApprovalDetailQuery.data?.payload && (
                                            <div className="rounded-md border p-3">
                                                <p className="mb-2 text-sm font-medium">Request Payload</p>
                                                <pre className="max-h-56 overflow-auto text-xs text-muted-foreground whitespace-pre-wrap">
                                                    {JSON.stringify(selectedApprovalDetailQuery.data.payload, null, 2)}
                                                </pre>
                                            </div>
                                        )}

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
                    </TabsContent>

                    <TabsContent value="policies" className="mt-4 space-y-4">
                        <Card className="max-w-3xl">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    createPolicyMutation.mutate({
                                        name: policyName,
                                        description: policyDescription || undefined,
                                        approval_type: policyApprovalType || undefined,
                                        priority: Number(policyPriority) || 100,
                                        staff_id: staffId,
                                    });
                                }}
                            >
                                <CardHeader>
                                    <CardTitle className="text-base">Create Policy</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-3 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                                        <Label htmlFor="policy-name">Name</Label>
                                        <Input id="policy-name" value={policyName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPolicyName(e.target.value)} required />
                                    </div>
                                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                                        <Label htmlFor="policy-description">Description (optional)</Label>
                                        <Input id="policy-description" value={policyDescription} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPolicyDescription(e.target.value)} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="policy-approval-type">Approval Type (optional)</Label>
                                        <Input id="policy-approval-type" placeholder="REVERSAL_REQUESTED" value={policyApprovalType} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPolicyApprovalType(e.target.value)} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="policy-priority">Priority</Label>
                                        <Input id="policy-priority" type="number" value={policyPriority} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPolicyPriority(e.target.value)} min={1} />
                                    </div>
                                    {createPolicyMutation.isError && (
                                        <p className="text-sm text-destructive sm:col-span-2">{createPolicyMutation.error?.message ?? 'Failed to create policy.'}</p>
                                    )}
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" className="w-full" disabled={!staffId || createPolicyMutation.isPending || !policyName.trim() || policiesEndpointUnavailable}>
                                        {createPolicyMutation.isPending ? 'Creating…' : 'Create Policy'}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between gap-3">
                                <CardTitle className="text-base">Policy Lifecycle</CardTitle>
                                <Button size="sm" variant="outline" disabled={policiesEndpointUnavailable} onClick={() => void policiesQuery.refetch()}>
                                    <RefreshCw className="h-4 w-4" />
                                    Refresh
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {policiesEndpointUnavailable && (
                                    <EmptyState
                                        title="Policy management unavailable in this environment"
                                        description="The staging API does not expose /approvals/policies yet (404). Deploy the latest API routes to enable policy CRUD."
                                    />
                                )}

                                {policiesQuery.isError && !policiesEndpointUnavailable && (
                                    <p className="text-sm text-destructive">{policiesQuery.error?.message ?? 'Failed to load policies.'}</p>
                                )}

                                {(policiesQuery.data?.items ?? []).length === 0 && !policiesQuery.isFetching && !policiesEndpointUnavailable && (
                                    <EmptyState title="No approval policies found" />
                                )}

                                {(policiesQuery.data?.items ?? []).map((policy) => {
                                    const full = policy as ApprovalPolicyFull;
                                    const isEditing = editingPolicyId === policy.id;
                                    return (
                                        <div key={policy.id} className="rounded-md border p-3 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium">{policy.name}</p>
                                                <Badge variant="outline">{policy.state}</Badge>
                                                <Badge variant="secondary">v{policy.version}</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {policy.id} • {policy.approval_type ?? 'ANY_TYPE'} • Priority {policy.priority}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                Stages: {(full.stages ?? []).length}
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={policiesEndpointUnavailable}
                                                    onClick={() => {
                                                        setEditingPolicyId(policy.id);
                                                        setEditPolicyName(policy.name);
                                                        setEditPolicyDescription(policy.description ?? '');
                                                        setEditPolicyApprovalType(policy.approval_type ?? '');
                                                        setEditPolicyPriority(String(policy.priority));
                                                    }}
                                                >
                                                    Edit
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={!staffId || policy.state === 'ACTIVE' || policyActionMutation.isPending || policiesEndpointUnavailable}
                                                    onClick={() => policyActionMutation.mutate({ policyId: policy.id, action: 'activate' })}
                                                >
                                                    Activate
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={!staffId || policy.state !== 'ACTIVE' || policyActionMutation.isPending || policiesEndpointUnavailable}
                                                    onClick={() => policyActionMutation.mutate({ policyId: policy.id, action: 'deactivate' })}
                                                >
                                                    Deactivate
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    disabled={policy.state === 'ACTIVE' || deletePolicyMutation.isPending || policiesEndpointUnavailable}
                                                    onClick={() => deletePolicyMutation.mutate(policy.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>

                                            {isEditing && (
                                                <form
                                                    className="mt-2 grid gap-2 sm:grid-cols-2"
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        updatePolicyMutation.mutate({
                                                            policyId: policy.id,
                                                            staff_id: staffId,
                                                            name: editPolicyName || undefined,
                                                            description: editPolicyDescription || undefined,
                                                            approval_type: editPolicyApprovalType || undefined,
                                                            priority: Number(editPolicyPriority) || undefined,
                                                        });
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                                                        <Label htmlFor={`edit-name-${policy.id}`}>Name</Label>
                                                        <Input id={`edit-name-${policy.id}`} value={editPolicyName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPolicyName(e.target.value)} />
                                                    </div>
                                                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                                                        <Label htmlFor={`edit-description-${policy.id}`}>Description</Label>
                                                        <Input id={`edit-description-${policy.id}`} value={editPolicyDescription} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPolicyDescription(e.target.value)} />
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        <Label htmlFor={`edit-type-${policy.id}`}>Approval Type</Label>
                                                        <Input id={`edit-type-${policy.id}`} value={editPolicyApprovalType} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPolicyApprovalType(e.target.value)} />
                                                    </div>
                                                    <div className="flex flex-col gap-1.5">
                                                        <Label htmlFor={`edit-priority-${policy.id}`}>Priority</Label>
                                                        <Input id={`edit-priority-${policy.id}`} type="number" value={editPolicyPriority} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditPolicyPriority(e.target.value)} />
                                                    </div>
                                                    <div className="sm:col-span-2 flex gap-2">
                                                        <Button type="submit" size="sm" disabled={!staffId || updatePolicyMutation.isPending || policiesEndpointUnavailable}>
                                                            {updatePolicyMutation.isPending ? 'Saving…' : 'Save Changes'}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setEditingPolicyId('');
                                                                setEditPolicyName('');
                                                                setEditPolicyDescription('');
                                                                setEditPolicyApprovalType('');
                                                                setEditPolicyPriority('100');
                                                            }}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                    {updatePolicyMutation.isError && (
                                                        <p className="text-sm text-destructive sm:col-span-2">{updatePolicyMutation.error?.message ?? 'Failed to update policy.'}</p>
                                                    )}
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="delegations" className="mt-4 space-y-6">
                        <Card className="max-w-3xl">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    createDelegationMutation.mutate();
                                }}
                            >
                                <CardHeader>
                                    <CardTitle className="text-base">Create Delegation</CardTitle>
                                </CardHeader>
                                <CardContent className="grid gap-3 sm:grid-cols-2">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegator-id">Delegator Staff ID</Label>
                                        <Input id="delegator-id" value={delegatorId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegatorId(e.target.value)} required />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegate-id">Delegate Staff ID</Label>
                                        <Input id="delegate-id" value={delegateId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegateId(e.target.value)} required />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegation-type">Approval Type (optional)</Label>
                                        <Input id="delegation-type" value={delegationType} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegationType(e.target.value)} placeholder="REVERSAL_REQUESTED" />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegation-reason">Reason (optional)</Label>
                                        <Input id="delegation-reason" value={delegationReason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegationReason(e.target.value)} />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegation-valid-from">Valid From</Label>
                                        <Input id="delegation-valid-from" type="datetime-local" value={delegationValidFrom} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegationValidFrom(e.target.value)} required />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="delegation-valid-to">Valid To</Label>
                                        <Input id="delegation-valid-to" type="datetime-local" value={delegationValidTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelegationValidTo(e.target.value)} required />
                                    </div>
                                    {createDelegationMutation.isError && (
                                        <p className="text-sm text-destructive sm:col-span-2">{createDelegationMutation.error?.message ?? 'Failed to create delegation.'}</p>
                                    )}
                                </CardContent>
                                <CardFooter>
                                    <Button type="submit" className="w-full" disabled={!staffId || createDelegationMutation.isPending || !delegatorId || !delegateId || !delegationValidFrom || !delegationValidTo || delegationsEndpointUnavailable}>
                                        {createDelegationMutation.isPending ? 'Creating…' : 'Create Delegation'}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Delegation Registry</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="w-full max-w-xs">
                                    <Label className="text-xs text-muted-foreground">State Filter</Label>
                                    <Select value={delegationStateFilter} onValueChange={setDelegationStateFilter}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                                            <SelectItem value="REVOKED">REVOKED</SelectItem>
                                            <SelectItem value="EXPIRED">EXPIRED</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {delegationsEndpointUnavailable && (
                                    <EmptyState
                                        title="Delegations unavailable in this environment"
                                        description="The staging API does not expose /approvals/delegations yet (404). Deploy the latest API routes to enable delegation management."
                                    />
                                )}

                                {delegationsQuery.isError && !delegationsEndpointUnavailable && (
                                    <p className="text-sm text-destructive">{delegationsQuery.error?.message ?? 'Failed to load delegations.'}</p>
                                )}

                                {(delegationsQuery.data?.items ?? []).length === 0 && !delegationsQuery.isFetching && !delegationsEndpointUnavailable && (
                                    <EmptyState title="No delegations found" />
                                )}

                                {(delegationsQuery.data?.items ?? []).map((delegation) => (
                                    <div key={delegation.id} className="rounded-md border p-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{delegation.state}</Badge>
                                            <p className="text-sm font-medium">{delegation.id}</p>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {delegation.delegator_id} → {delegation.delegate_id}
                                            {' • '}
                                            {delegation.approval_type ?? 'ALL_TYPES'}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {delegation.valid_from} to {delegation.valid_to}
                                        </p>
                                        <div className="mt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={!staffId || delegation.state !== 'ACTIVE' || revokeDelegationMutation.isPending || delegationsEndpointUnavailable}
                                                onClick={() => revokeDelegationMutation.mutate(delegation.id)}
                                            >
                                                Revoke
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="funding" className="mt-4">
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
                    </TabsContent>
                </Tabs>

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
