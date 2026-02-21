import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle } from 'lucide-react';
import {
    useAuth,
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
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@caricash/ui';

interface PostingReceipt {
    posting_id: string;
    state: string;
    [key: string]: unknown;
}

export function WithdrawalPage() {
    const { actor } = useAuth();
    const api = useApi();

    const [customerMsisdn, setCustomerMsisdn] = useState('');
    const [amount, setAmount] = useState('');
    const [pin, setPin] = useState('');
    const [receipt, setReceipt] = useState<PostingReceipt | null>(null);

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<PostingReceipt>('/tx/withdrawal', {
                agent_id: actor!.id,
                customer_msisdn: customerMsisdn,
                amount,
                currency: 'BBD',
                idempotency_key: crypto.randomUUID(),
            });
        },
        onSuccess: (res) => {
            setReceipt(res);
            setCustomerMsisdn('');
            setAmount('');
            setPin('');
        },
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate();
    }

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Cash-Out (Withdrawal)"
                    description="Withdraw cash from a customer's CariCash wallet"
                />

                <Card className="max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <CardHeader>
                            <CardTitle className="text-base">Withdrawal Details</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="customer-msisdn">Customer Phone Number</Label>
                                <Input
                                    id="customer-msisdn"
                                    type="tel"
                                    placeholder="e.g. +1246XXXXXXX"
                                    value={customerMsisdn}
                                    onChange={(e) => setCustomerMsisdn(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="amount">Amount (BBD)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor="pin">Confirm PIN</Label>
                                <Input
                                    id="pin"
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={6}
                                    placeholder="Enter your agent PIN"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    required
                                />
                            </div>

                            {mutation.isError && (
                                <p className="text-sm text-destructive">
                                    {mutation.error?.message ?? 'Withdrawal failed. Please try again.'}
                                </p>
                            )}
                        </CardContent>
                        <CardFooter>
                            <Button
                                type="submit"
                                className="w-full"
                                disabled={mutation.isPending || !customerMsisdn || !amount || !pin}
                            >
                                {mutation.isPending ? 'Processing…' : 'Submit Withdrawal'}
                            </Button>
                        </CardFooter>
                    </form>
                </Card>
            </div>

            {/* Success dialog */}
            <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Withdrawal Successful</DialogTitle>
                        <DialogDescription className="text-center">
                            The cash-out has been processed successfully.
                        </DialogDescription>
                    </DialogHeader>
                    {receipt && (
                        <div className="rounded-md bg-muted p-4 text-sm">
                            <p>
                                <span className="font-medium">Posting ID:</span>{' '}
                                {receipt.posting_id}
                            </p>
                            <p>
                                <span className="font-medium">State:</span> {receipt.state}
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
