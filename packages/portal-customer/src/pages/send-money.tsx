import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRightLeft, CheckCircle, Clock3, Sparkles, UserRound } from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    CardFooter,
    Input,
    Label,
    Button,
    Badge,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@caricash/ui';
import { ActionConfirmModal } from '../components/action-confirm-modal.js';

interface PostingReceipt {
    posting_id: string;
    state: string;
    [key: string]: unknown;
}

const QUICK_AMOUNTS = ['20.00', '50.00', '100.00', '200.00'] as const;
const RECENT_RECIPIENTS_KEY = 'caricash_recent_recipients';

function loadRecentRecipients(): string[] {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(RECENT_RECIPIENTS_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string').slice(0, 5);
    } catch {
        return [];
    }
}

function persistRecentRecipient(msisdn: string): string[] {
    const current = loadRecentRecipients();
    const next = [msisdn, ...current.filter((item) => item !== msisdn)].slice(0, 5);
    localStorage.setItem(RECENT_RECIPIENTS_KEY, JSON.stringify(next));
    return next;
}

export function SendMoneyPage() {
    const { actor } = useAuth();
    const api = useApi();

    const [receiverMsisdn, setReceiverMsisdn] = useState('');
    const [amount, setAmount] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [receipt, setReceipt] = useState<PostingReceipt | null>(null);
    const [recentRecipients, setRecentRecipients] = useState<string[]>(() => loadRecentRecipients());

    const numericAmount = useMemo(() => Number(amount), [amount]);
    const normalizedAmount = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount.toFixed(2) : '0.00';
    const canReview = receiverMsisdn.trim().length >= 7 && Number.isFinite(numericAmount) && numericAmount > 0;

    const mutation = useMutation({
        mutationFn: async () => {
            return api.post<PostingReceipt>('/tx/p2p', {
                sender_msisdn: actor!.name,
                receiver_msisdn: receiverMsisdn.trim(),
                amount: normalizedAmount,
                currency: 'BBD',
                idempotency_key: crypto.randomUUID(),
            });
        },
        onSuccess: (res) => {
            setReceipt(res);
            setRecentRecipients(persistRecentRecipient(receiverMsisdn.trim()));
            setReceiverMsisdn('');
            setAmount('');
            setConfirmPin('');
            setConfirmOpen(false);
        },
    });

    function handleReviewSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canReview) return;
        setConfirmOpen(true);
    }

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Send Money"
                    description="Fast customer-to-customer transfers with secure PIN confirmation."
                    badge="Customer Payments"
                />

                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <Card>
                        <form onSubmit={handleReviewSubmit}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <ArrowRightLeft className="h-4 w-4 text-primary" />
                                    Transfer Details
                                </CardTitle>
                                <CardDescription>
                                    Add recipient and amount, then review before authorizing.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="receiver">Receiver Phone Number</Label>
                                    <Input
                                        id="receiver"
                                        type="tel"
                                        placeholder="e.g. +1246XXXXXXX"
                                        value={receiverMsisdn}
                                        onChange={(e) => setReceiverMsisdn(e.target.value)}
                                        required
                                    />
                                </div>

                                {recentRecipients.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                            Recent Recipients
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {recentRecipients.map((recipient) => (
                                                <button
                                                    key={recipient}
                                                    type="button"
                                                    className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-accent/45"
                                                    onClick={() => setReceiverMsisdn(recipient)}
                                                >
                                                    {recipient}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

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

                                <div className="flex flex-wrap gap-2">
                                    {QUICK_AMOUNTS.map((quick) => (
                                        <button
                                            key={quick}
                                            type="button"
                                            className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary/40 hover:bg-accent/45"
                                            onClick={() => setAmount(quick)}
                                        >
                                            BBD {quick}
                                        </button>
                                    ))}
                                </div>

                                {mutation.isError ? (
                                    <p className="text-sm text-destructive">
                                        {mutation.error?.message ?? 'Transfer failed. Please try again.'}
                                    </p>
                                ) : null}
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full" disabled={!canReview}>
                                    Review Transfer
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">Transfer Snapshot</CardTitle>
                            <CardDescription>
                                Customer-centered breakdown before you confirm.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-xl border border-border/70 bg-muted/25 p-4">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-sm font-semibold">You are sending</p>
                                    <Badge variant="outline">Instant</Badge>
                                </div>
                                <p className="text-2xl font-bold tracking-tight">BBD {normalizedAmount}</p>
                            </div>

                            <div className="rounded-xl border border-border/70 p-4 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Receiver</span>
                                    <span className="font-semibold">
                                        {receiverMsisdn.trim() || 'Not set'}
                                    </span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-muted-foreground">Transfer fee</span>
                                    <span className="font-semibold">BBD 0.00</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-muted-foreground">Delivery speed</span>
                                    <span className="font-semibold">Real time</span>
                                </div>
                            </div>

                            <div className="rounded-xl border border-dashed border-border/70 bg-background/60 p-4 text-sm text-muted-foreground">
                                <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                    Pro Tips
                                </p>
                                <p className="mb-1 flex items-start gap-2">
                                    <UserRound className="mt-0.5 h-3.5 w-3.5 text-primary" />
                                    Save frequent recipients for 1-tap transfers.
                                </p>
                                <p className="flex items-start gap-2">
                                    <Clock3 className="mt-0.5 h-3.5 w-3.5 text-primary" />
                                    Transfers are posted instantly when authorized.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <ActionConfirmModal
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) setConfirmPin('');
                }}
                title="Confirm Transfer"
                description="Review the details and enter your PIN to complete this transfer."
                summary={[
                    { label: 'From', value: actor?.name ?? 'Your wallet' },
                    { label: 'To', value: receiverMsisdn.trim() || '-' },
                    { label: 'Amount', value: `BBD ${normalizedAmount}` },
                    { label: 'Fee', value: 'BBD 0.00' },
                    { label: 'Recipient gets', value: `BBD ${normalizedAmount}` },
                ]}
                pin={confirmPin}
                onPinChange={setConfirmPin}
                onConfirm={() => mutation.mutate()}
                confirmLabel="Confirm Transfer"
                loading={mutation.isPending}
                error={mutation.isError ? mutation.error?.message ?? 'Transfer failed.' : null}
            />

            <Dialog open={!!receipt} onOpenChange={() => setReceipt(null)}>
                <DialogContent>
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        </div>
                        <DialogTitle className="text-center">Transfer Successful</DialogTitle>
                        <DialogDescription className="text-center">
                            Your transfer has been processed.
                        </DialogDescription>
                    </DialogHeader>
                    {receipt ? (
                        <div className="rounded-md bg-muted p-4 text-sm">
                            <p>
                                <span className="font-medium">Posting ID:</span> {receipt.posting_id}
                            </p>
                            <p>
                                <span className="font-medium">State:</span> {receipt.state}
                            </p>
                        </div>
                    ) : null}
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
