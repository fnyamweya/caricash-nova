import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle, XCircle } from 'lucide-react';
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
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
    Separator,
} from '@caricash/ui';

interface OverdraftRequestResponse {
    id: string;
    account_id: string;
    limit_amount: string;
    currency: string;
    status: string;
    [key: string]: unknown;
}

interface OverdraftActionResponse {
    id: string;
    status: string;
    [key: string]: unknown;
}

export function OverdraftPage() {
    const api = useApi();

    // Request overdraft state
    const [accountId, setAccountId] = useState('');
    const [limitAmount, setLimitAmount] = useState('');
    const [currency, setCurrency] = useState<'BBD' | 'USD'>('BBD');
    const [requestResult, setRequestResult] = useState<OverdraftRequestResponse | null>(null);

    // Approve/reject state
    const [actionId, setActionId] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [approveCorrelation, setApproveCorrelation] = useState('');
    const [rejectCorrelation, setRejectCorrelation] = useState('');
    const [actionResult, setActionResult] = useState<{
        type: 'approve' | 'reject';
        data: OverdraftActionResponse;
    } | null>(null);

    const requestMutation = useMutation({
        mutationFn: () =>
            api.post<OverdraftRequestResponse>('/ops/overdraft/request', {
                account_id: accountId,
                limit_amount: limitAmount,
                currency,
            }),
        onSuccess: (res: OverdraftRequestResponse) => {
            setRequestResult(res);
            setAccountId('');
            setLimitAmount('');
            setCurrency('BBD');
        },
    });

    const approveMutation = useMutation({
        mutationFn: () =>
            api.post<OverdraftActionResponse>(`/ops/overdraft/${actionId}/approve`, {
                ...(approveCorrelation ? { correlation_id: approveCorrelation } : {}),
            }),
        onSuccess: (res: OverdraftActionResponse) => {
            setActionResult({ type: 'approve', data: res });
            setActionId('');
            setApproveCorrelation('');
        },
    });

    const rejectMutation = useMutation({
        mutationFn: () =>
            api.post<OverdraftActionResponse>(`/ops/overdraft/${actionId}/reject`, {
                reason: rejectReason,
                ...(rejectCorrelation ? { correlation_id: rejectCorrelation } : {}),
            }),
        onSuccess: (res: OverdraftActionResponse) => {
            setActionResult({ type: 'reject', data: res });
            setActionId('');
            setRejectReason('');
            setRejectCorrelation('');
        },
    });

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Overdraft Facility"
                    description="Request, approve, or reject overdraft facilities"
                />

                {/* Request Overdraft */}
                <Card className="max-w-lg">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            requestMutation.mutate();
                        }}
                    >
                        <CardHeader>
                            <CardTitle className="text-base">Request Overdraft</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="od-account">Account ID</Label>
                                <Input
                                    id="od-account"
                                    type="text"
                                    placeholder="Account ID"
                                    value={accountId}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAccountId(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="od-limit">Limit Amount</Label>
                                <Input
                                    id="od-limit"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="e.g. 5000.00"
                                    value={limitAmount}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLimitAmount(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label>Currency</Label>
                                <Select
                                    value={currency}
                                    onValueChange={(v: string) => setCurrency(v as 'BBD' | 'USD')}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select currency" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="BBD">BBD — Barbadian Dollar</SelectItem>
                                        <SelectItem value="USD">USD — US Dollar</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {requestMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {requestMutation.error?.message ?? 'Failed to request overdraft.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={requestMutation.isPending || !accountId || !limitAmount}
                            >
                                {requestMutation.isPending ? 'Submitting…' : 'Request Overdraft'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>

                <Separator />

                {/* Approve / Reject Overdraft */}
                <Card className="max-w-lg">
                    <CardHeader>
                        <CardTitle className="text-base">Approve / Reject Overdraft</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="od-action-id">Overdraft Request ID</Label>
                            <Input
                                id="od-action-id"
                                type="text"
                                placeholder="Request ID"
                                value={actionId}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActionId(e.target.value)}
                            />
                        </div>

                        {/* Approve section */}
                        <div className="flex flex-col gap-2 rounded-md border p-3">
                            <p className="text-sm font-medium">Approve</p>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="od-approve-corr">Correlation ID (optional)</Label>
                                <Input
                                    id="od-approve-corr"
                                    type="text"
                                    placeholder="Optional"
                                    value={approveCorrelation}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApproveCorrelation(e.target.value)}
                                />
                            </div>
                            <Button
                                onClick={() => approveMutation.mutate()}
                                disabled={approveMutation.isPending || !actionId}
                                className="w-full"
                            >
                                {approveMutation.isPending ? 'Approving…' : 'Approve Overdraft'}
                            </Button>
                            {approveMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {approveMutation.error?.message ?? 'Approval failed.'}
                                </p>
                            )}
                        </div>

                        {/* Reject section */}
                        <div className="flex flex-col gap-2 rounded-md border p-3">
                            <p className="text-sm font-medium">Reject</p>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="od-reject-reason">Reason</Label>
                                <Input
                                    id="od-reject-reason"
                                    type="text"
                                    placeholder="Reason for rejection"
                                    value={rejectReason}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReason(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="od-reject-corr">Correlation ID (optional)</Label>
                                <Input
                                    id="od-reject-corr"
                                    type="text"
                                    placeholder="Optional"
                                    value={rejectCorrelation}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectCorrelation(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="destructive"
                                onClick={() => rejectMutation.mutate()}
                                disabled={rejectMutation.isPending || !actionId || !rejectReason}
                                className="w-full"
                            >
                                {rejectMutation.isPending ? 'Rejecting…' : 'Reject Overdraft'}
                            </Button>
                            {rejectMutation.isError && (
                                <p className="text-sm text-destructive">
                                    {rejectMutation.error?.message ?? 'Rejection failed.'}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Request success dialog */}
            <Dialog open={!!requestResult} onOpenChange={() => setRequestResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Overdraft Requested</DialogTitle>
                        <DialogDescription className="text-center">
                            The overdraft facility request has been submitted.
                        </DialogDescription>
                    </DialogHeader>
                    {requestResult && (
                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                            <p>
                                <span className="font-medium">Request ID:</span> {requestResult.id}
                            </p>
                            <p>
                                <span className="font-medium">Account:</span>{' '}
                                {requestResult.account_id}
                            </p>
                            <p>
                                <span className="font-medium">Limit:</span>{' '}
                                {requestResult.limit_amount} {requestResult.currency}
                            </p>
                            <p>
                                <span className="font-medium">Status:</span> {requestResult.status}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" className="w-full">
                                Done
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Action result dialog */}
            <Dialog open={!!actionResult} onOpenChange={() => setActionResult(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            {actionResult?.type === 'approve' ? (
                                <CheckCircle className="h-6 w-6 text-green-500" />
                            ) : (
                                <XCircle className="h-6 w-6 text-red-500" />
                            )}
                        </div>
                        <DialogTitle className="text-center">
                            {actionResult?.type === 'approve'
                                ? 'Overdraft Approved'
                                : 'Overdraft Rejected'}
                        </DialogTitle>
                        <DialogDescription className="text-center">
                            The overdraft request has been{' '}
                            {actionResult?.type === 'approve' ? 'approved' : 'rejected'}.
                        </DialogDescription>
                    </DialogHeader>
                    {actionResult && (
                        <div className="rounded-md bg-muted p-4 text-sm flex flex-col gap-1">
                            <p>
                                <span className="font-medium">Request ID:</span>{' '}
                                {actionResult.data.id}
                            </p>
                            <p>
                                <span className="font-medium">Status:</span>{' '}
                                {actionResult.data.status}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button variant="outline" className="w-full">
                                Done
                            </Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}
