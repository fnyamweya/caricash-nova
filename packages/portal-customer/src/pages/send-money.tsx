import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowRightLeft,
    Clock3,
    Sparkles,
    UserRound,
    Phone,
    ShieldCheck,
    ReceiptText,
    ShieldAlert,
    Loader2,
    Zap,
    ChevronRight,
} from 'lucide-react';
import {
    ApiError,
    useAuth,
    useApi,
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
    Avatar,
    AvatarFallback,
    cn,
    getInitials,
} from '@caricash/ui';
import { ActionConfirmModal } from '../components/action-confirm-modal.js';
import {
    CustomerSuccessDialog,
    CustomerFlowStepPills,
    CustomerStickyActionBar,
    QuickAmountGrid,
    VerificationSuccessNotice,
} from '../components/customer-flow-ui.js';
import { consumeSendFlowPrefill } from '../lib/customer-prefill.js';

interface PostingReceipt {
    posting_id: string;
    state: string;
    [key: string]: unknown;
}

interface ActorLookupResult {
    actor: {
        id: string;
        type: string;
        state: string;
        name: string;
        first_name?: string;
        last_name?: string;
    };
}

interface ContactPickerContact {
    name?: string[];
    tel?: string[];
}

interface ContactPickerApi {
    select: (
        properties: Array<'name' | 'tel'>,
        options?: { multiple?: boolean },
    ) => Promise<ContactPickerContact[]>;
}

interface ContactNavigator extends Navigator {
    contacts?: ContactPickerApi;
}

const QUICK_AMOUNTS = ['20.00', '50.00', '100.00', '200.00'] as const;
const RECENT_RECIPIENTS_KEY = 'caricash_recent_recipients';
const RECIPIENT_LOOKUP_COUNT_KEY = 'caricash_recipient_lookup_count';
const RECIPIENT_LOOKUP_LIMIT = 3;

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

function loadRecipientLookupCount(): number {
    if (typeof window === 'undefined') return 0;
    const raw = sessionStorage.getItem(RECIPIENT_LOOKUP_COUNT_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
}

function isInsufficientFundsError(err: unknown): boolean {
    if (!(err instanceof ApiError)) {
        return err instanceof Error && /insufficient|balance too low/i.test(err.message);
    }

    const body = err.body;
    if (body && typeof body === 'object') {
        const code = 'code' in body ? String((body as { code?: unknown }).code ?? '') : '';
        const name = 'name' in body ? String((body as { name?: unknown }).name ?? '') : '';
        if (code === 'INSUFFICIENT_FUNDS' || name === 'InsufficientFundsError') return true;
    }

    return /insufficient|balance too low/i.test(err.message);
}

function getTransferErrorMessage(err: unknown): string {
    if (isInsufficientFundsError(err)) {
        return 'Insufficient balance. Reduce the amount and try again.';
    }
    if (err instanceof Error && err.message.trim()) {
        return err.message;
    }
    return 'Transfer failed. Please try again.';
}

export function SendMoneyPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const [receiverMsisdn, setReceiverMsisdn] = useState('');
    const [amount, setAmount] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [receipt, setReceipt] = useState<PostingReceipt | null>(null);
    const [recentRecipients, setRecentRecipients] = useState<string[]>(() => loadRecentRecipients());
    const [recipientLookupCount, setRecipientLookupCount] = useState<number>(() => loadRecipientLookupCount());
    const [selectedContactName, setSelectedContactName] = useState<string | null>(null);
    const [contactPickerError, setContactPickerError] = useState<string | null>(null);

    // Recipient verification state
    const [verifiedRecipient, setVerifiedRecipient] = useState<ActorLookupResult['actor'] | null>(null);
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    useEffect(() => {
        const prefill = consumeSendFlowPrefill();
        if (!prefill) return;
        if (prefill.receiverMsisdn) setReceiverMsisdn(prefill.receiverMsisdn);
        if (prefill.amount) setAmount(prefill.amount);
        if (prefill.contactName) setSelectedContactName(prefill.contactName);
    }, []);

    const numericAmount = useMemo(() => Number(amount), [amount]);
    const normalizedAmount = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount.toFixed(2) : '0.00';
    const canReview = receiverMsisdn.trim().length >= 7 && Number.isFinite(numericAmount) && numericAmount > 0;
    const remainingRecipientLookups = Math.max(RECIPIENT_LOOKUP_LIMIT - recipientLookupCount, 0);

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
            setVerifiedRecipient(null);
        },
    });
    const mutationErrorMessage = mutation.isError ? getTransferErrorMessage(mutation.error) : null;

    function consumeRecipientLookupAttempt(): boolean {
        if (recipientLookupCount >= RECIPIENT_LOOKUP_LIMIT) {
            return false;
        }
        const next = recipientLookupCount + 1;
        setRecipientLookupCount(next);
        sessionStorage.setItem(RECIPIENT_LOOKUP_COUNT_KEY, String(next));
        return true;
    }

    async function beginReview() {
        if (!canReview) return;
        mutation.reset();

        if (!consumeRecipientLookupAttempt()) {
            setVerifyError('Recipient verification limit reached for this session. Start a new session to verify more recipients.');
            setVerifiedRecipient(null);
            return;
        }

        // Look up recipient before showing PIN modal
        setVerifyLoading(true);
        setVerifyError(null);
        setVerifiedRecipient(null);

        try {
            const result = await api.get<ActorLookupResult>(
                `/actors/lookup?msisdn=${encodeURIComponent(receiverMsisdn.trim())}`,
            );
            setVerifiedRecipient(result.actor);
            setConfirmOpen(true);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Recipient not found';
            setVerifyError(msg);
        } finally {
            setVerifyLoading(false);
        }
    }

    async function handleReviewSubmit(e: React.FormEvent) {
        e.preventDefault();
        await beginReview();
    }

    function getRecipientDisplayName(): string {
        if (!verifiedRecipient) return receiverMsisdn.trim() || '-';
        const parts = [verifiedRecipient.first_name, verifiedRecipient.last_name].filter(Boolean);
        if (parts.length > 0) return parts.join(' ');
        return verifiedRecipient.name || receiverMsisdn.trim();
    }

    async function handlePickFromContacts() {
        setContactPickerError(null);
        const nav = navigator as ContactNavigator;
        if (!nav.contacts?.select) {
            setContactPickerError('Contact picker is not supported on this device/browser.');
            return;
        }

        try {
            const contacts = await nav.contacts.select(['name', 'tel'], {
                multiple: false,
            });
            const first = contacts[0];
            const tel = first?.tel?.[0]?.trim();
            if (!tel) {
                setContactPickerError('Selected contact has no phone number.');
                return;
            }
            const normalized = tel.replace(/[^\d+]/g, '');
            setReceiverMsisdn(normalized);
            setSelectedContactName(first?.name?.[0]?.trim() || null);
        } catch {
            setContactPickerError('Unable to read contacts. Check permissions and try again.');
        }
    }

    const stepItems = [
        {
            key: 'recipient',
            label: 'Recipient',
            state: (receiverMsisdn.trim().length >= 7 ? 'done' : 'active') as 'done' | 'active',
        },
        {
            key: 'amount',
            label: 'Amount',
            state: (
                Number.isFinite(numericAmount) && numericAmount > 0
                    ? 'done'
                    : receiverMsisdn.trim().length >= 7
                        ? 'active'
                        : 'upcoming'
            ) as 'upcoming' | 'active' | 'done',
        },
        {
            key: 'review',
            label: 'Review & PIN',
            state: (
                confirmOpen || verifiedRecipient
                    ? 'done'
                    : canReview
                        ? 'active'
                        : 'upcoming'
            ) as 'upcoming' | 'active' | 'done',
        },
    ];

    return (
        <PageTransition>
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className="space-y-4 sm:space-y-5"
            >
                <Card className="overflow-hidden rounded-3xl border-border/70 bg-background/88">
                    <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="rounded-xl">Send Money</Badge>
                                    <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                        <Zap className="h-3 w-3 text-primary" />
                                        Instant
                                    </Badge>
                                    <Badge variant="outline" className="rounded-xl">BBD 0.00 fee</Badge>
                                </div>
                                <CardTitle className="text-lg tracking-tight sm:text-xl">
                                    Move money in three quick steps
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Choose a recipient, set an amount, then review and confirm with your PIN.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => navigate({ to: '/history' })}
                                >
                                    <ReceiptText className="h-4 w-4" />
                                    Activity
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => navigate({ to: '/pay' })}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                    Pay instead
                                </Button>
                            </div>
                        </div>

                        <CustomerFlowStepPills steps={stepItems} />
                    </CardHeader>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.03 }}
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <form onSubmit={handleReviewSubmit}>
                                <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <ArrowRightLeft className="h-4 w-4 text-primary" />
                                        Transfer Details
                                    </CardTitle>
                                    <CardDescription className="text-sm">
                                        Recipient verification is required before PIN confirmation.
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="space-y-4 px-4 pb-4 sm:px-5">
                                    <motion.div
                                        layout
                                        className="rounded-2xl border border-primary/15 bg-primary/5 p-4"
                                    >
                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-sm font-semibold">Wallet to Wallet Transfer</p>
                                            <Badge variant="outline" className="rounded-xl">Real time</Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            The recipient name is checked before you enter your PIN.
                                        </p>
                                    </motion.div>

                                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                                        <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="receiver">Recipient phone</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="receiver"
                                                        type="tel"
                                                        placeholder="e.g. +12465551234"
                                                        value={receiverMsisdn}
                                                        onChange={(e) => {
                                                            setReceiverMsisdn(e.target.value);
                                                            setVerifyError(null);
                                                            setVerifiedRecipient(null);
                                                            mutation.reset();
                                                        }}
                                                        className="h-11 rounded-xl border-border/70 pr-12"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        onClick={handlePickFromContacts}
                                                        aria-label="Pick from contacts"
                                                        title="Pick from contacts"
                                                    >
                                                        <Phone className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                <AnimatePresence initial={false}>
                                                    {selectedContactName ? (
                                                        <motion.p
                                                            key="selected-contact"
                                                            initial={{ opacity: 0, y: -4 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -4 }}
                                                            className="text-xs text-muted-foreground"
                                                        >
                                                            Selected contact: {selectedContactName}
                                                        </motion.p>
                                                    ) : null}
                                                </AnimatePresence>
                                                <AnimatePresence initial={false}>
                                                    {contactPickerError ? (
                                                        <motion.p
                                                            key="contact-error"
                                                            initial={{ opacity: 0, y: -4 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -4 }}
                                                            className="text-xs text-destructive"
                                                        >
                                                            {contactPickerError}
                                                        </motion.p>
                                                    ) : null}
                                                </AnimatePresence>
                                            </div>

                                            {recentRecipients.length > 0 ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                                        Recent Recipients
                                                    </p>
                                                    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                        {recentRecipients.map((recipient) => (
                                                            <motion.button
                                                                key={recipient}
                                                                type="button"
                                                                whileHover={{ y: -1 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                onClick={() => {
                                                                    setReceiverMsisdn(recipient);
                                                                    setSelectedContactName(null);
                                                                }}
                                                                className={cn(
                                                                    'min-w-[140px] shrink-0 rounded-2xl border p-3 text-left transition-colors',
                                                                    receiverMsisdn.trim() === recipient
                                                                        ? 'border-primary/25 bg-primary/10'
                                                                        : 'border-border/70 bg-background/80 hover:border-primary/20 hover:bg-primary/5',
                                                                )}
                                                            >
                                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                                    <Avatar className="h-7 w-7 rounded-xl border bg-background">
                                                                        <AvatarFallback className="rounded-xl text-[10px]">
                                                                            {getInitials(recipient)}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[10px]">
                                                                        Send
                                                                    </Badge>
                                                                </div>
                                                                <p className="truncate text-xs font-semibold">{recipient}</p>
                                                                <p className="mt-1 text-[11px] text-muted-foreground">Recent recipient</p>
                                                            </motion.button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="amount">Amount (BBD)</Label>
                                                <Input
                                                    id="amount"
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={(e) => {
                                                        setAmount(e.target.value);
                                                        mutation.reset();
                                                    }}
                                                    className="h-11 rounded-xl border-border/70 text-base"
                                                    required
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Recipient receives the full amount. No transfer fee.
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    Recipient name checks left this session: {remainingRecipientLookups}
                                                </p>
                                            </div>

                                            <QuickAmountGrid
                                                amounts={QUICK_AMOUNTS}
                                                onSelect={(value) => {
                                                    setAmount(value);
                                                    mutation.reset();
                                                }}
                                            />

                                            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <p className="text-sm font-semibold">Transfer preview</p>
                                                    <Badge variant="outline" className="rounded-xl">
                                                        <ShieldCheck className="h-3 w-3 text-primary" />
                                                        PIN secure
                                                    </Badge>
                                                </div>
                                                <p className="text-2xl font-semibold tracking-tight">
                                                    BBD {normalizedAmount}
                                                </p>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    Posted instantly after confirmation.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <AnimatePresence initial={false}>
                                        {verifiedRecipient ? (
                                            <motion.div
                                                key="verified-recipient"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                            >
                                                <VerificationSuccessNotice
                                                    title="Recipient verified"
                                                    description={`${getRecipientDisplayName()} is ready to receive this transfer.`}
                                                />
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>

                                    <AnimatePresence initial={false}>
                                        {verifyError ? (
                                            <motion.div
                                                key="verify-error"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                                className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"
                                            >
                                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                                <span>{verifyError}</span>
                                            </motion.div>
                                        ) : null}
                                    </AnimatePresence>

                                    <AnimatePresence initial={false}>
                                        {mutation.isError ? (
                                            <motion.p
                                                key="mutation-error"
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 6 }}
                                                className="text-sm text-destructive"
                                            >
                                                {mutationErrorMessage}
                                            </motion.p>
                                        ) : null}
                                    </AnimatePresence>
                                </CardContent>

                                <CardFooter className="hidden flex-col gap-2 px-4 pb-5 sm:px-5 lg:flex">
                                    <Button type="submit" className="w-full rounded-xl" disabled={!canReview || verifyLoading}>
                                        {verifyLoading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Verifying recipient...
                                            </>
                                        ) : (
                                            'Review Transfer'
                                        )}
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground">
                                        You’ll review the recipient and amount one more time before entering your PIN.
                                    </p>
                                </CardFooter>
                            </form>
                        </Card>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: 0.06 }}
                        className="space-y-4 lg:sticky lg:top-6 lg:self-start"
                    >
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Transfer Snapshot</CardTitle>
                                <CardDescription className="text-sm">
                                    Live summary as you build the transfer.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                                <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-primary/8 to-transparent p-4">
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-sm font-semibold">You are sending</p>
                                        <Badge variant="outline" className="rounded-xl">No fee</Badge>
                                    </div>
                                    <p className="text-2xl font-semibold tracking-tight">BBD {normalizedAmount}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">Real-time wallet transfer</p>
                                </div>

                                <div className="space-y-2 rounded-2xl border border-border/70 bg-background/75 p-4 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Recipient</span>
                                        <span className="max-w-[60%] truncate font-semibold">
                                            {receiverMsisdn.trim() || 'Not set'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Name</span>
                                        <span className="max-w-[60%] truncate font-semibold">
                                            {verifiedRecipient ? getRecipientDisplayName() : 'Pending verification'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Delivery</span>
                                        <span className="font-semibold">Instant</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-muted-foreground">Fee</span>
                                        <span className="font-semibold">BBD 0.00</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <CardTitle className="text-base">Smart transfer tips</CardTitle>
                                <CardDescription className="text-sm">
                                    Small safeguards that make transfers faster and safer.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Tap a recent recipient to prefill and move faster.</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Transfers post immediately after you confirm with your PIN.</span>
                                </div>
                                <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>Verification helps reduce mistakes before money moves.</span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </motion.div>

            <CustomerStickyActionBar
                title={`BBD ${normalizedAmount}`}
                subtitle={receiverMsisdn.trim() ? `To ${receiverMsisdn.trim()}` : 'Add recipient and amount to continue'}
                actionLabel={verifyLoading ? 'Verifying...' : 'Review'}
                onAction={() => {
                    void beginReview();
                }}
                disabled={!canReview || verifyLoading}
                loading={verifyLoading}
                icon={<ArrowRightLeft className="h-4 w-4" />}
            />

            <ActionConfirmModal
                open={confirmOpen}
                onOpenChange={(open) => {
                    setConfirmOpen(open);
                    if (!open) setConfirmPin('');
                }}
                title="Confirm Transfer"
                description="Verify the recipient and enter your PIN to complete this transfer."
                summary={[
                    { label: 'From', value: actor?.name ?? 'Your wallet' },
                    { label: 'To (MSISDN)', value: receiverMsisdn.trim() || '-' },
                    { label: 'Recipient name', value: getRecipientDisplayName() },
                    { label: 'Amount', value: `BBD ${normalizedAmount}` },
                    { label: 'Fee', value: 'BBD 0.00' },
                    { label: 'Recipient gets', value: `BBD ${normalizedAmount}` },
                ]}
                pin={confirmPin}
                onPinChange={(value) => {
                    setConfirmPin(value);
                    if (mutation.isError) mutation.reset();
                }}
                onConfirm={() => {
                    mutation.reset();
                    mutation.mutate();
                }}
                confirmLabel="Confirm Transfer"
                loading={mutation.isPending}
                error={mutationErrorMessage}
            />

            <CustomerSuccessDialog
                open={!!receipt}
                onOpenChange={(open) => {
                    if (!open) setReceipt(null);
                }}
                title="Money sent"
                description={`BBD ${normalizedAmount} was sent to ${getRecipientDisplayName()}.`}
            >
                {receipt ? (
                    <div className="rounded-md bg-muted p-4 text-sm">
                        <p>
                            <span className="font-medium">Reference:</span> {receipt.posting_id}
                        </p>
                        <p>
                            <span className="font-medium">Status:</span> {receipt.state}
                        </p>
                        <p className="mt-1 text-muted-foreground">You can find this transfer in Activity.</p>
                    </div>
                ) : null}
            </CustomerSuccessDialog>
        </PageTransition>
    );
}
