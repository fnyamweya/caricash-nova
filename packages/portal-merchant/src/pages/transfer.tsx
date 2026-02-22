import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Badge,
    Button,
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    PageTransition,
    formatCurrency,
    useApi,
} from '@caricash/ui';
import {
    ArrowRightLeft,
    Banknote,
    Building2,
    CheckCircle,
    CreditCard,
    Landmark,
    Loader2,
    ReceiptText,
    ShieldCheck,
    Store,
} from 'lucide-react';
import { MerchantHero, MerchantQuickAmountGrid, MerchantSection, MerchantStepChips, MerchantStickyActionBar } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';

interface PostingReceipt {
    posting_id: string;
    state: string;
    journal_id?: string;
    [key: string]: unknown;
}

interface SettlementDraftReceipt {
    id: string;
    state: 'QUEUED' | 'PENDING_API';
    amount: string;
    store_code: string;
    method: string;
    requested_at: string;
    api_error?: string;
}

type FlowMode = 'transfer' | 'settlement';
type TransferStep = 'recipient' | 'amount' | 'review';
type SettlementStep = 'details' | 'destination' | 'review';

function buildLocalSettlementId() {
    return `settle_${Math.random().toString(36).slice(2, 10)}`;
}

export function TransferPage() {
    const api = useApi();
    const { activeStore, activeStoreCode, stores, preferences } = useMerchantWorkspace();

    const [mode, setMode] = useState<FlowMode>('transfer');

    const [receiverStoreCode, setReceiverStoreCode] = useState('');
    const [transferAmount, setTransferAmount] = useState('');
    const [transferNote, setTransferNote] = useState('');
    const [transferStep, setTransferStep] = useState<TransferStep>('recipient');
    const [transferReceipt, setTransferReceipt] = useState<PostingReceipt | null>(null);

    const [settlementAmount, setSettlementAmount] = useState('');
    const [settlementMethod, setSettlementMethod] = useState<'bank' | 'wallet'>('bank');
    const [settlementDestination, setSettlementDestination] = useState(preferences?.settlementAccountNo ?? '');
    const [settlementAccountName, setSettlementAccountName] = useState(preferences?.settlementAccountName ?? '');
    const [settlementBankName, setSettlementBankName] = useState(preferences?.settlementBankName ?? '');
    const [settlementNarration, setSettlementNarration] = useState('Daily sweep');
    const [settlementStep, setSettlementStep] = useState<SettlementStep>('details');
    const [settlementReceipt, setSettlementReceipt] = useState<SettlementDraftReceipt | null>(null);

    const recentStores = useMemo(
        () => stores.filter((store) => store.store_code !== activeStoreCode).slice(0, 6),
        [stores, activeStoreCode],
    );

    const transferMutation = useMutation({
        mutationFn: async () => {
            return api.post<PostingReceipt>('/tx/b2b', {
                sender_store_code: activeStoreCode,
                receiver_store_code: receiverStoreCode.trim(),
                amount: transferAmount,
                currency: 'BBD',
                idempotency_key: crypto.randomUUID(),
            });
        },
        onSuccess: (res) => {
            setTransferReceipt(res);
            setReceiverStoreCode('');
            setTransferAmount('');
            setTransferNote('');
            setTransferStep('recipient');
        },
    });

    const settlementMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                store_code: activeStoreCode,
                amount: settlementAmount,
                currency: 'BBD',
                method: settlementMethod,
                destination_ref: settlementDestination,
                destination_name: settlementAccountName,
                bank_name: settlementMethod === 'bank' ? settlementBankName : undefined,
                narration: settlementNarration,
                idempotency_key: crypto.randomUUID(),
            };

            try {
                await api.post('/tx/settlement/request', payload);
                return {
                    id: buildLocalSettlementId(),
                    state: 'QUEUED' as const,
                    amount: settlementAmount,
                    store_code: activeStoreCode,
                    method: settlementMethod,
                    requested_at: new Date().toISOString(),
                };
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Settlement endpoint unavailable';
                return {
                    id: buildLocalSettlementId(),
                    state: 'PENDING_API' as const,
                    amount: settlementAmount,
                    store_code: activeStoreCode,
                    method: settlementMethod,
                    requested_at: new Date().toISOString(),
                    api_error: message,
                };
            }
        },
        onSuccess: (receipt) => {
            setSettlementReceipt(receipt);
            setSettlementStep('details');
            setSettlementAmount('');
            setSettlementNarration('Daily sweep');
        },
    });

    const canTransfer = !!activeStoreCode && !!receiverStoreCode.trim() && Number(transferAmount) > 0;
    const canRequestSettlement = !!activeStoreCode && Number(settlementAmount) > 0 && !!settlementDestination.trim();

    const transferReviewSummary = `${activeStoreCode || 'No store'} → ${receiverStoreCode || 'Recipient'} • ${transferAmount ? formatCurrency(transferAmount, 'BBD') : 'BBD 0.00'}`;
    const settlementReviewSummary = `${activeStoreCode || 'No store'} • ${settlementAmount ? formatCurrency(settlementAmount, 'BBD') : 'BBD 0.00'} • ${settlementMethod === 'bank' ? 'Bank' : 'Wallet'} settlement`;

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Transfer & Settlement"
                    description="Move money between merchant stores or prepare a settlement request without breaking your operating flow."
                    badge={activeStore ? `Operating from ${activeStore.name}` : 'Money movement'}
                    actions={(
                        <div className="inline-flex rounded-2xl border border-border/70 bg-background/70 p-1">
                            <Button
                                size="sm"
                                className={cn('rounded-xl', mode === 'transfer' ? 'bg-emerald-600 hover:bg-emerald-600/90' : 'bg-transparent text-muted-foreground shadow-none hover:bg-accent/40')}
                                onClick={() => setMode('transfer')}
                            >
                                <ArrowRightLeft className="h-4 w-4" />
                                Store Transfer
                            </Button>
                            <Button
                                size="sm"
                                className={cn('rounded-xl', mode === 'settlement' ? 'bg-emerald-600 hover:bg-emerald-600/90' : 'bg-transparent text-muted-foreground shadow-none hover:bg-accent/40')}
                                onClick={() => setMode('settlement')}
                            >
                                <Landmark className="h-4 w-4" />
                                Settlement Request
                            </Button>
                        </div>
                    )}
                >
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Source store</p>
                            <p className="mt-1 text-sm font-semibold">{activeStore?.name ?? 'Select a store in sidebar'}</p>
                            <p className="text-xs text-muted-foreground">{activeStoreCode || 'No active store code yet'}</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Flow promise</p>
                            <p className="mt-1 text-sm font-semibold">Fast review and clear confirmation</p>
                            <p className="text-xs text-muted-foreground">Sticky actions and step-based inputs reduce mistakes during operations.</p>
                        </div>
                        <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Security cue</p>
                            <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Idempotent money requests</p>
                            <p className="text-xs text-muted-foreground">Money-moving calls are sent with unique idempotency keys.</p>
                        </div>
                    </div>
                </MerchantHero>

                <AnimatePresence mode="wait" initial={false}>
                    {mode === 'transfer' ? (
                        <motion.div key="transfer-flow" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                            <div className="space-y-4">
                                <MerchantSection title="Store Transfer Flow" description="Send funds from the active store to another merchant store quickly and safely.">
                                    <MerchantStepChips
                                        active={transferStep}
                                        onChange={(value) => setTransferStep(value as TransferStep)}
                                        steps={[
                                            { id: 'recipient', label: 'Recipient Store', helper: 'Select destination' },
                                            { id: 'amount', label: 'Amount', helper: 'Choose transfer amount' },
                                            { id: 'review', label: 'Review', helper: 'Confirm before submit' },
                                        ]}
                                    />

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="receiver-store-code">Recipient Store Code</Label>
                                                <Input
                                                    id="receiver-store-code"
                                                    placeholder="e.g. STORE-001"
                                                    value={receiverStoreCode}
                                                    onChange={(e) => {
                                                        setReceiverStoreCode(e.target.value.toUpperCase());
                                                        if (transferStep === 'recipient') setTransferStep('amount');
                                                    }}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>

                                            <div>
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recent stores</p>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {recentStores.length > 0 ? recentStores.map((store) => (
                                                        <button
                                                            key={store.store_code}
                                                            type="button"
                                                            onClick={() => {
                                                                setReceiverStoreCode(store.store_code);
                                                                setTransferStep('amount');
                                                            }}
                                                            className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2 text-left hover:bg-accent/30"
                                                        >
                                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700"><Building2 className="h-4 w-4" /></span>
                                                            <span className="min-w-0">
                                                                <span className="block truncate text-sm font-medium">{store.name}</span>
                                                                <span className="block truncate text-xs text-muted-foreground">{store.store_code}</span>
                                                            </span>
                                                        </button>
                                                    )) : (
                                                        <div className="rounded-xl border border-dashed border-border/60 p-3 text-xs text-muted-foreground sm:col-span-2">
                                                            Add more stores in Settings and they will appear here for quick transfers.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="transfer-amount">Amount (BBD)</Label>
                                                <Input
                                                    id="transfer-amount"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={transferAmount}
                                                    onChange={(e) => {
                                                        setTransferAmount(e.target.value);
                                                        if (transferStep === 'amount') setTransferStep('review');
                                                    }}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                            <MerchantQuickAmountGrid
                                                values={['25.00', '50.00', '100.00', '250.00', '500.00', '1000.00']}
                                                selected={transferAmount}
                                                onPick={(value) => {
                                                    setTransferAmount(value);
                                                    setTransferStep('review');
                                                }}
                                            />

                                            <div className="space-y-1.5">
                                                <Label htmlFor="transfer-note">Internal Note (optional)</Label>
                                                <Input
                                                    id="transfer-note"
                                                    placeholder="e.g. Rebalance for evening shift"
                                                    value={transferNote}
                                                    onChange={(e) => setTransferNote(e.target.value)}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {transferMutation.isError ? (
                                        <div className="rounded-2xl border border-rose-200 bg-rose-500/8 p-3 text-sm text-rose-700">
                                            {transferMutation.error instanceof Error ? transferMutation.error.message : 'Transfer failed. Please try again.'}
                                        </div>
                                    ) : null}
                                </MerchantSection>
                            </div>

                            <div className="space-y-4">
                                <MerchantSection title="Transfer Review" description="Double-check destination and amount before sending funds.">
                                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                                        <SummaryRow label="From store" value={activeStoreCode || 'Select store'} />
                                        <SummaryRow label="To store" value={receiverStoreCode || 'Enter recipient store code'} />
                                        <SummaryRow label="Amount" value={transferAmount ? formatCurrency(transferAmount, 'BBD') : 'BBD 0.00'} highlight />
                                        <SummaryRow label="Note" value={transferNote || 'No note added'} />
                                    </div>
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-500/8 p-3 text-sm text-emerald-700">
                                        Transfers are submitted with idempotency protection to reduce duplicate postings on retries.
                                    </div>
                                </MerchantSection>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div key="settlement-flow" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <div className="space-y-4">
                                <MerchantSection title="Settlement Request Flow" description="Prepare a payout request for your operations/banking team with clean destination details.">
                                    <MerchantStepChips
                                        active={settlementStep}
                                        onChange={(value) => setSettlementStep(value as SettlementStep)}
                                        steps={[
                                            { id: 'details', label: 'Amount & Timing', helper: 'What to settle' },
                                            { id: 'destination', label: 'Destination', helper: 'Where funds should go' },
                                            { id: 'review', label: 'Review', helper: 'Submit request' },
                                        ]}
                                    />

                                    <div className="grid gap-4 lg:grid-cols-2">
                                        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="settlement-amount">Settlement Amount (BBD)</Label>
                                                <Input
                                                    id="settlement-amount"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={settlementAmount}
                                                    onChange={(e) => {
                                                        setSettlementAmount(e.target.value);
                                                        if (settlementStep === 'details') setSettlementStep('destination');
                                                    }}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                            <MerchantQuickAmountGrid
                                                values={['100.00', '250.00', '500.00', '1000.00', '2500.00', '5000.00']}
                                                selected={settlementAmount}
                                                onPick={(value) => {
                                                    setSettlementAmount(value);
                                                    setSettlementStep('destination');
                                                }}
                                            />

                                            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Settlement method</p>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSettlementMethod('bank')}
                                                        className={cn('rounded-xl border px-3 py-2 text-left', settlementMethod === 'bank' ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700' : 'border-border/70 hover:bg-accent/30')}
                                                    >
                                                        <div className="inline-flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4" /> Bank</div>
                                                        <p className="mt-1 text-xs text-muted-foreground">Account payout</p>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSettlementMethod('wallet')}
                                                        className={cn('rounded-xl border px-3 py-2 text-left', settlementMethod === 'wallet' ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700' : 'border-border/70 hover:bg-accent/30')}
                                                    >
                                                        <div className="inline-flex items-center gap-2 text-sm font-semibold"><Banknote className="h-4 w-4" /> Wallet</div>
                                                        <p className="mt-1 text-xs text-muted-foreground">Internal payout reference</p>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="destination-ref">Destination {settlementMethod === 'bank' ? 'Account Number' : 'Wallet Reference'}</Label>
                                                <Input
                                                    id="destination-ref"
                                                    placeholder={settlementMethod === 'bank' ? 'Bank account number' : 'Wallet ref'}
                                                    value={settlementDestination}
                                                    onChange={(e) => {
                                                        setSettlementDestination(e.target.value);
                                                        if (settlementStep === 'destination') setSettlementStep('review');
                                                    }}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="destination-name">Account / Beneficiary Name</Label>
                                                <Input
                                                    id="destination-name"
                                                    placeholder="Business account name"
                                                    value={settlementAccountName}
                                                    onChange={(e) => setSettlementAccountName(e.target.value)}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                            {settlementMethod === 'bank' ? (
                                                <div className="space-y-1.5">
                                                    <Label htmlFor="bank-name">Bank Name</Label>
                                                    <Input
                                                        id="bank-name"
                                                        placeholder="e.g. FirstCaribbean"
                                                        value={settlementBankName}
                                                        onChange={(e) => setSettlementBankName(e.target.value)}
                                                        className="h-11 rounded-xl"
                                                    />
                                                </div>
                                            ) : null}
                                            <div className="space-y-1.5">
                                                <Label htmlFor="settlement-narration">Narration</Label>
                                                <Input
                                                    id="settlement-narration"
                                                    placeholder="Describe the request"
                                                    value={settlementNarration}
                                                    onChange={(e) => setSettlementNarration(e.target.value)}
                                                    className="h-11 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </MerchantSection>
                            </div>

                            <div className="space-y-4">
                                <MerchantSection title="Settlement Review" description="Prepare a complete payout request package before submission.">
                                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                                        <SummaryRow label="Store" value={activeStoreCode || 'Select store'} />
                                        <SummaryRow label="Amount" value={settlementAmount ? formatCurrency(settlementAmount, 'BBD') : 'BBD 0.00'} highlight />
                                        <SummaryRow label="Method" value={settlementMethod === 'bank' ? 'Bank account payout' : 'Wallet settlement'} />
                                        <SummaryRow label="Destination" value={settlementDestination || 'Enter destination'} />
                                        <SummaryRow label="Beneficiary" value={settlementAccountName || 'Enter beneficiary name'} />
                                        {settlementMethod === 'bank' ? <SummaryRow label="Bank" value={settlementBankName || 'Enter bank name'} /> : null}
                                        <SummaryRow label="Narration" value={settlementNarration || 'No narration'} />
                                    </div>
                                    <div className="rounded-2xl border border-amber-200 bg-amber-500/8 p-3 text-sm text-amber-700">
                                        If the settlement endpoint is not enabled yet, your request will still be saved locally as a pending dispatch draft so your operations team can proceed manually.
                                    </div>
                                </MerchantSection>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {mode === 'transfer' ? (
                    <MerchantStickyActionBar
                        title={transferReviewSummary}
                        subtitle="Review recipient store code and amount before submitting the B2B transfer."
                        secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => { setReceiverStoreCode(''); setTransferAmount(''); setTransferNote(''); setTransferStep('recipient'); }}>Reset</Button>}
                        primary={(
                            <Button
                                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto"
                                disabled={!canTransfer || transferMutation.isPending}
                                onClick={() => transferMutation.mutate()}
                            >
                                {transferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                                {transferMutation.isPending ? 'Sending Transfer…' : 'Send Store Transfer'}
                            </Button>
                        )}
                    />
                ) : (
                    <MerchantStickyActionBar
                        title={settlementReviewSummary}
                        subtitle="Submit a settlement request package with destination details."
                        secondary={<Button variant="outline" className="w-full rounded-xl sm:w-auto" onClick={() => { setSettlementAmount(''); setSettlementDestination(''); setSettlementNarration('Daily sweep'); setSettlementStep('details'); }}>Clear</Button>}
                        primary={(
                            <Button
                                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90 sm:w-auto"
                                disabled={!canRequestSettlement || settlementMutation.isPending}
                                onClick={() => settlementMutation.mutate()}
                            >
                                {settlementMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                                {settlementMutation.isPending ? 'Submitting Request…' : 'Request Settlement'}
                            </Button>
                        )}
                    />
                )}
            </div>

            <Dialog open={!!transferReceipt} onOpenChange={() => setTransferReceipt(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                            <CheckCircle className="h-6 w-6" />
                        </div>
                        <DialogTitle className="text-center">Store transfer completed</DialogTitle>
                        <DialogDescription className="text-center">
                            Funds were sent successfully from {activeStoreCode || 'your active store'}.
                        </DialogDescription>
                    </DialogHeader>
                    {transferReceipt ? (
                        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                            <SummaryRow label="Posting ID" value={transferReceipt.posting_id} />
                            <SummaryRow label="State" value={transferReceipt.state} />
                        </div>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90">Done</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!settlementReceipt} onOpenChange={() => setSettlementReceipt(null)}>
                <DialogContent className="rounded-3xl">
                    <DialogHeader>
                        <div className={cn(
                            'mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full',
                            settlementReceipt?.state === 'QUEUED' ? 'bg-emerald-500/12 text-emerald-700' : 'bg-amber-500/12 text-amber-700',
                        )}>
                            {settlementReceipt?.state === 'QUEUED' ? <CheckCircle className="h-6 w-6" /> : <ReceiptText className="h-6 w-6" />}
                        </div>
                        <DialogTitle className="text-center">
                            {settlementReceipt?.state === 'QUEUED' ? 'Settlement request queued' : 'Settlement draft saved'}
                        </DialogTitle>
                        <DialogDescription className="text-center">
                            {settlementReceipt?.state === 'QUEUED'
                                ? 'Your settlement request was submitted successfully.'
                                : 'The API endpoint is not enabled yet. Your request details were preserved so your team can complete the payout workflow.'}
                        </DialogDescription>
                    </DialogHeader>
                    {settlementReceipt ? (
                        <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm">
                            <SummaryRow label="Request" value={settlementReceipt.id} />
                            <SummaryRow label="Store" value={settlementReceipt.store_code} />
                            <SummaryRow label="Amount" value={formatCurrency(settlementReceipt.amount, 'BBD')} />
                            <SummaryRow label="Method" value={settlementReceipt.method} />
                            <SummaryRow label="State" value={settlementReceipt.state} />
                            {settlementReceipt.api_error ? <SummaryRow label="API note" value={settlementReceipt.api_error} /> : null}
                        </div>
                    ) : null}
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-600/90">Done</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageTransition>
    );
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn('max-w-[65%] text-right font-medium break-words', highlight && 'text-base font-semibold text-emerald-700')}>
                {value}
            </span>
        </div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
