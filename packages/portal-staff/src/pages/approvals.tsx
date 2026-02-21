import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import {
    useApi,
    PageHeader,
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
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
} from '@caricash/ui';

interface ApprovalActionResponse {
    approval_id: string;
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

    // Approve state
    const [approveId, setApproveId] = useState('');
    const [approveCorrelation, setApproveCorrelation] = useState('');
    const [approveResult, setApproveResult] = useState<ApprovalActionResponse | null>(null);

    // Reject state
    const [rejectId, setRejectId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [rejectCorrelation, setRejectCorrelation] = useState('');
    const [rejectResult, setRejectResult] = useState<ApprovalActionResponse | null>(null);

    const [fundAmount, setFundAmount] = useState('');
    const [fundReason, setFundReason] = useState('');
    const [fundReference, setFundReference] = useState('');
    const [fundIdempotencyKey, setFundIdempotencyKey] = useState('');
    const [fundCorrelation, setFundCorrelation] = useState('');
    const [fundResult, setFundResult] = useState<SuspenseFundResponse | null>(null);

    const approveMutation = useMutation({
        mutationFn: async () => {
            return api.post<ApprovalActionResponse>(`/approvals/${approveId}/approve`, {
                staff_id: staffId,
                ...(approveCorrelation ? { correlation_id: approveCorrelation } : {}),
            });
        },
        onSuccess: (res) => {
            setApproveResult(res);
            setApproveId('');
            setApproveCorrelation('');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async () => {
            return api.post<ApprovalActionResponse>(`/approvals/${rejectId}/reject`, {
                staff_id: staffId,
                reason: rejectReason,
                ...(rejectCorrelation ? { correlation_id: rejectCorrelation } : {}),
            });
        },
        onSuccess: (res) => {
            setRejectResult(res);
            setRejectId('');
            setRejectReason('');
            setRejectCorrelation('');
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

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Approval Management"
                    description="Review, approve, or reject pending requests"
                />

                <Card className="max-w-xl">
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

                {/* Notice about list endpoint */}
                <Card>
                    <CardContent className="flex items-center gap-3 pt-6">
                        <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                            The <Badge variant="outline">GET /approvals</Badge> endpoint currently
                            returns <Badge variant="secondary">501 Not Implemented</Badge>. Use the
                            forms below to approve or reject requests by ID.
                        </p>
                    </CardContent>
                </Card>

                <Tabs defaultValue="approve">
                    <TabsList>
                        <TabsTrigger value="approve">Approve</TabsTrigger>
                        <TabsTrigger value="reject">Reject</TabsTrigger>
                    </TabsList>

                    {/* Approve tab */}
                    <TabsContent value="approve">
                        <Card className="max-w-lg">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    approveMutation.mutate();
                                }}
                            >
                                <CardHeader>
                                    <CardTitle className="text-base">Approve Request</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="approve-id">Request ID</Label>
                                        <Input
                                            id="approve-id"
                                            type="text"
                                            placeholder="Approval request ID"
                                            value={approveId}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApproveId(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="approve-corr">Correlation ID (optional)</Label>
                                        <Input
                                            id="approve-corr"
                                            type="text"
                                            placeholder="Optional correlation ID"
                                            value={approveCorrelation}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApproveCorrelation(e.target.value)}
                                        />
                                    </div>

                                    {approveMutation.isError && (
                                        <p className="text-sm text-destructive">
                                            {approveMutation.error?.message ?? 'Approval failed.'}
                                        </p>
                                    )}

                                    {approveResult && (
                                        <div className="rounded-md bg-green-500/10 p-3 text-sm flex items-center gap-2">
                                            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                                            <span>
                                                Approved successfully. State:{' '}
                                                <span className="font-medium">{approveResult.state}</span>
                                            </span>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={approveMutation.isPending || !approveId}
                                    >
                                        {approveMutation.isPending ? 'Approving…' : 'Approve'}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </TabsContent>

                    {/* Reject tab */}
                    <TabsContent value="reject">
                        <Card className="max-w-lg">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    rejectMutation.mutate();
                                }}
                            >
                                <CardHeader>
                                    <CardTitle className="text-base">Reject Request</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-col gap-4">
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="reject-id">Request ID</Label>
                                        <Input
                                            id="reject-id"
                                            type="text"
                                            placeholder="Approval request ID"
                                            value={rejectId}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectId(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="reject-reason">Reason</Label>
                                        <Input
                                            id="reject-reason"
                                            type="text"
                                            placeholder="Reason for rejection"
                                            value={rejectReason}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <Label htmlFor="reject-corr">Correlation ID (optional)</Label>
                                        <Input
                                            id="reject-corr"
                                            type="text"
                                            placeholder="Optional correlation ID"
                                            value={rejectCorrelation}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectCorrelation(e.target.value)}
                                        />
                                    </div>

                                    {rejectMutation.isError && (
                                        <p className="text-sm text-destructive">
                                            {rejectMutation.error?.message ?? 'Rejection failed.'}
                                        </p>
                                    )}

                                    {rejectResult && (
                                        <div className="rounded-md bg-red-500/10 p-3 text-sm flex items-center gap-2">
                                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                            <span>
                                                Rejected successfully. State:{' '}
                                                <span className="font-medium">{rejectResult.state}</span>
                                            </span>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter>
                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        className="w-full"
                                        disabled={rejectMutation.isPending || !rejectId || !rejectReason}
                                    >
                                        {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                                    </Button>
                                </CardFooter>
                            </form>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </PageTransition>
    );
}
