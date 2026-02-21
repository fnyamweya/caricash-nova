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

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Approval Management"
                    description="Review, approve, or reject pending requests"
                />

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
