import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    ArrowDownLeft,
    ArrowUpRight,
    Clock,
    CreditCard,
    QrCode,
    Receipt,
    Search,
    SendHorizontal,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
    Users,
    Wallet,
} from 'lucide-react';
import {
    ApiError,
    Avatar,
    AvatarFallback,
    Badge,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    EmptyState,
    Input,
    LoadingSpinner,
    PageTransition,
    cn,
    formatCurrency,
    formatDate,
    formatRelativeTime,
    getInitials,
    useApi,
    useAuth,
} from '@caricash/ui';
import { setPayFlowPrefill, setSendFlowPrefill } from '../lib/customer-prefill.js';

interface BalanceResponse {
    balance: string;
    currency: string;
    wallet_id: string;
}

interface StatementEntry {
    journal_id: string;
    txn_type: string;
    posted_at: string;
    entry_type: 'DR' | 'CR';
    amount: string;
    currency: string;
    line_description?: string;
}

interface StatementResponse {
    entries: StatementEntry[];
    count: number;
}

interface RecentMerchant {
    storeCode: string;
    merchantName?: string;
}

interface ContactShortcut {
    id: string;
    label: string;
    subtitle: string;
    kind: 'recipient' | 'merchant';
    href: '/send' | '/pay';
    msisdn?: string;
    storeCode?: string;
    merchantName?: string;
}

type ActivityFilter = 'all' | 'incoming' | 'outgoing';

function loadRecentRecipients(): string[] {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem('caricash_recent_recipients');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string').slice(0, 6);
    } catch {
        return [];
    }
}

function loadRecentMerchants(): RecentMerchant[] {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem('caricash_recent_merchants');
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(
                (item): item is RecentMerchant =>
                    !!item &&
                    typeof item === 'object' &&
                    typeof (item as { storeCode?: unknown }).storeCode === 'string',
            )
            .map((item) => ({
                storeCode: item.storeCode.trim(),
                merchantName: item.merchantName?.trim() || undefined,
            }))
            .filter((item) => !!item.storeCode)
            .slice(0, 6);
    } catch {
        return [];
    }
}

function entryTitle(entry: StatementEntry): string {
    if (entry.entry_type === 'CR') return 'Money received';
    if (/merchant|payment|pay/i.test(entry.txn_type)) return 'Merchant payment';
    if (/p2p|transfer|send/i.test(entry.txn_type)) return 'Money sent';
    return entry.txn_type || 'Wallet transaction';
}

function entryCounterparty(entry: StatementEntry): string {
    const source = entry.line_description?.trim();
    if (source) return source;
    return `Ref ${entry.journal_id.slice(0, 10)}…`;
}

function entryStatus(entry: StatementEntry): { label: string; tone: string } {
    if (entry.entry_type === 'CR') {
        return {
            label: 'Received',
            tone: 'bg-green-500/10 text-green-700 ring-green-500/20 dark:text-green-300',
        };
    }
    if (/merchant|payment|pay/i.test(entry.txn_type)) {
        return {
            label: 'Paid',
            tone: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
        };
    }
    return {
        label: 'Sent',
        tone: 'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300',
    };
}

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();
    const [searchValue, setSearchValue] = useState('');
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

    const balanceQuery = useQuery({
        queryKey: ['balance', actor?.id],
        queryFn: () => api.get<BalanceResponse>(`/wallets/CUSTOMER/${actor!.id}/BBD/balance`),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const recentTxQuery = useQuery<StatementResponse>({
        queryKey: ['customer-dashboard-recent-transactions', actor?.id],
        queryFn: async () => {
            try {
                return await api.get<StatementResponse>(
                    `/wallets/CUSTOMER/${actor!.id}/BBD/statement?limit=12`,
                );
            } catch (err) {
                if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
                    return { entries: [], count: 0 };
                }
                throw err;
            }
        },
        enabled: !!actor?.id,
        refetchInterval: 60_000,
    });

    const recentEntries = recentTxQuery.data?.entries ?? [];

    const { incomingCount, outgoingCount, incomingTotal, outgoingTotal } = useMemo(() => {
        let incomingCountAcc = 0;
        let outgoingCountAcc = 0;
        let incomingTotalAcc = 0;
        let outgoingTotalAcc = 0;

        for (const entry of recentEntries) {
            const numeric = Number(entry.amount);
            const amount = Number.isFinite(numeric) ? numeric : 0;
            if (entry.entry_type === 'CR') {
                incomingCountAcc += 1;
                incomingTotalAcc += amount;
            } else {
                outgoingCountAcc += 1;
                outgoingTotalAcc += amount;
            }
        }

        return {
            incomingCount: incomingCountAcc,
            outgoingCount: outgoingCountAcc,
            incomingTotal: incomingTotalAcc,
            outgoingTotal: outgoingTotalAcc,
        };
    }, [recentEntries]);

    const filteredEntries = useMemo(() => {
        const query = searchValue.trim().toLowerCase();
        return recentEntries.filter((entry) => {
            if (activityFilter === 'incoming' && entry.entry_type !== 'CR') return false;
            if (activityFilter === 'outgoing' && entry.entry_type !== 'DR') return false;

            if (!query) return true;

            return (
                entry.txn_type.toLowerCase().includes(query) ||
                (entry.line_description ?? '').toLowerCase().includes(query) ||
                entry.journal_id.toLowerCase().includes(query)
            );
        });
    }, [activityFilter, recentEntries, searchValue]);

    const contactShortcuts = useMemo<ContactShortcut[]>(() => {
        const recipients = loadRecentRecipients().map((msisdn) => ({
            id: `c:${msisdn}`,
            label: msisdn,
            subtitle: 'Recent recipient',
            kind: 'recipient' as const,
            href: '/send' as const,
            msisdn,
        }));
        const merchants = loadRecentMerchants().map((merchant) => ({
            id: `m:${merchant.storeCode}`,
            label: merchant.merchantName || merchant.storeCode,
            subtitle: merchant.merchantName ? merchant.storeCode : 'Merchant',
            kind: 'merchant' as const,
            href: '/pay' as const,
            storeCode: merchant.storeCode,
            merchantName: merchant.merchantName,
        }));
        return [...recipients, ...merchants].slice(0, 8);
    }, []);

    const balanceAmount = Number(balanceQuery.data?.balance ?? '0');
    const safeSpendValue = Number.isFinite(balanceAmount)
        ? Math.max(balanceAmount - outgoingTotal * 0.25, 0)
        : 0;

    const walletCards = [
        {
            id: 'main',
            title: 'Main Wallet',
            subtitle: 'Available funds',
            amount: formatCurrency(balanceQuery.data?.balance ?? '0.00', 'BBD'),
            accent:
                'from-emerald-700 via-emerald-600 to-teal-500 text-white border-white/10',
            chip: 'Primary',
            footer: 'Fast transfers & merchant checkout',
        },
        {
            id: 'spend',
            title: 'Safe to Spend',
            subtitle: 'Suggested budget view',
            amount: formatCurrency(safeSpendValue.toFixed(2), 'BBD'),
            accent:
                'from-zinc-900 via-zinc-800 to-zinc-700 text-white border-white/10',
            chip: 'Smart view',
            footer: 'Based on recent outgoing activity',
        },
        {
            id: 'recent',
            title: 'Recent Inflow',
            subtitle: 'Last loaded transactions',
            amount: formatCurrency(incomingTotal.toFixed(2), 'BBD'),
            accent:
                'from-white to-white text-foreground border-border/70',
            chip: 'Activity',
            footer: `${incomingCount} incoming • ${outgoingCount} outgoing`,
        },
    ] as const;

    return (
        <PageTransition>
            <div className="space-y-4 sm:space-y-5">
                <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <Card className="overflow-hidden rounded-3xl border-border/70 bg-background/88">
                        <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-4 sm:px-5 sm:py-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="rounded-xl">
                                            Wallet Dashboard
                                        </Badge>
                                        <Badge variant="outline" className="rounded-xl">
                                            BBD
                                        </Badge>
                                        <Badge variant="outline" className="inline-flex items-center gap-1 rounded-xl">
                                            <ShieldCheck className="h-3 w-3 text-primary" />
                                            Protected
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-lg tracking-tight sm:text-xl">
                                        Your money at a glance
                                    </CardTitle>
                                    <CardDescription className="mt-1 max-w-xl text-sm">
                                        Send, pay, and review activity from one interactive wallet hub built for mobile and tablet use.
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
                                        Activity
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => navigate({ to: '/send' })}
                                    >
                                        <SendHorizontal className="h-4 w-4" />
                                        Send
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/send' })}
                                    className="group rounded-2xl border border-border/70 bg-background/75 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <SendHorizontal className="h-4 w-4" />
                                        </span>
                                        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                    </div>
                                    <p className="text-sm font-semibold">Send money</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Transfer instantly to another customer.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/pay' })}
                                    className="group rounded-2xl border border-border/70 bg-background/75 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <QrCode className="h-4 w-4" />
                                        </span>
                                        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                    </div>
                                    <p className="text-sm font-semibold">Pay merchant</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Checkout by QR or store code with PIN confirmation.
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => navigate({ to: '/settings' })}
                                    className="group rounded-2xl border border-border/70 bg-background/75 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                >
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                            <ShieldCheck className="h-4 w-4" />
                                        </span>
                                        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                    </div>
                                    <p className="text-sm font-semibold">Settings & KYC</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Complete verification and personalize your wallet.
                                    </p>
                                </button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-5 px-4 py-4 sm:px-5 sm:py-5">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                            Wallet Cards
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="rounded-xl">
                                        <CreditCard className="h-3 w-3" />
                                        Wallet views
                                    </Badge>
                                </div>

                                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {walletCards.map((walletCard) => (
                                        <div
                                            key={walletCard.id}
                                            className={cn(
                                                'min-w-[260px] snap-start rounded-3xl border p-4 shadow-sm sm:min-w-[300px]',
                                                'bg-gradient-to-br',
                                                walletCard.accent,
                                            )}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <p className={cn(
                                                        'text-xs font-semibold uppercase tracking-[0.08em]',
                                                        walletCard.id === 'recent' ? 'text-muted-foreground' : 'text-white/80',
                                                    )}>
                                                        {walletCard.title}
                                                    </p>
                                                    <p className={cn(
                                                        'mt-1 text-xs',
                                                        walletCard.id === 'recent' ? 'text-muted-foreground' : 'text-white/80',
                                                    )}>
                                                        {walletCard.subtitle}
                                                    </p>
                                                </div>
                                                <Badge
                                                    className={cn(
                                                        'rounded-xl',
                                                        walletCard.id === 'recent'
                                                            ? 'bg-primary/10 text-primary hover:bg-primary/10'
                                                            : 'bg-white/10 text-white hover:bg-white/10',
                                                    )}
                                                >
                                                    {walletCard.chip}
                                                </Badge>
                                            </div>
                                            <p className={cn(
                                                'mt-5 text-2xl font-semibold tracking-tight sm:text-[2rem]',
                                                walletCard.id === 'recent' ? 'text-foreground' : 'text-white',
                                            )}>
                                                {balanceQuery.isLoading && walletCard.id === 'main'
                                                    ? 'Loading...'
                                                    : walletCard.amount}
                                            </p>
                                            <div className="mt-6 flex items-center justify-between gap-2">
                                                <p className={cn(
                                                    'text-xs',
                                                    walletCard.id === 'recent' ? 'text-muted-foreground' : 'text-white/75',
                                                )}>
                                                    {walletCard.footer}
                                                </p>
                                                <div className={cn(
                                                    'h-8 w-8 rounded-full',
                                                    walletCard.id === 'recent'
                                                        ? 'bg-primary/10'
                                                        : 'bg-white/15',
                                                )} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">Recent contacts</p>
                                            <p className="text-xs text-muted-foreground">
                                                Quick shortcuts from your recent send and pay activity.
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="rounded-xl">
                                            <Users className="h-3 w-3" />
                                            {contactShortcuts.length}
                                        </Badge>
                                    </div>

                                    {contactShortcuts.length > 0 ? (
                                        <div className="space-y-3">
                                            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                {contactShortcuts.map((contact) => (
                                                    <button
                                                        key={contact.id}
                                                        type="button"
                                                        onClick={() => {
                                                            if (contact.kind === 'recipient') {
                                                                setSendFlowPrefill({
                                                                    receiverMsisdn: contact.msisdn,
                                                                });
                                                            } else {
                                                                setPayFlowPrefill({
                                                                    storeCode: contact.storeCode,
                                                                    merchantName: contact.merchantName,
                                                                });
                                                            }
                                                            navigate({ to: contact.href });
                                                        }}
                                                        className="group min-w-[132px] shrink-0 rounded-2xl border border-border/70 bg-background/80 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                                                    >
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <Avatar className="h-8 w-8 rounded-xl border bg-background">
                                                                <AvatarFallback className="rounded-xl text-[11px]">
                                                                    {getInitials(contact.label)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <Badge
                                                                variant="outline"
                                                                className={cn(
                                                                    'rounded-lg px-2 py-0.5 text-[10px]',
                                                                    contact.kind === 'merchant'
                                                                        ? 'border-primary/20 bg-primary/5 text-primary'
                                                                        : '',
                                                                )}
                                                            >
                                                                {contact.kind === 'merchant' ? 'Pay' : 'Send'}
                                                            </Badge>
                                                        </div>
                                                        <p className="truncate text-xs font-semibold">
                                                            {contact.label}
                                                        </p>
                                                        <p className="mt-1 truncate text-[11px] text-muted-foreground">
                                                            {contact.subtitle}
                                                        </p>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-xl"
                                                    onClick={() => {
                                                        const recentRecipient = contactShortcuts.find((item) => item.kind === 'recipient');
                                                        if (recentRecipient?.msisdn) {
                                                            setSendFlowPrefill({ receiverMsisdn: recentRecipient.msisdn });
                                                        }
                                                        navigate({ to: '/send' });
                                                    }}
                                                >
                                                    <SendHorizontal className="h-4 w-4" />
                                                    Send again
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="rounded-xl"
                                                    onClick={() => {
                                                        const recentMerchant = contactShortcuts.find((item) => item.kind === 'merchant');
                                                        if (recentMerchant?.storeCode) {
                                                            setPayFlowPrefill({
                                                                storeCode: recentMerchant.storeCode,
                                                                merchantName: recentMerchant.merchantName,
                                                            });
                                                        }
                                                        navigate({ to: '/pay' });
                                                    }}
                                                >
                                                    <ShoppingBag className="h-4 w-4" />
                                                    Pay merchant
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
                                            <p className="text-sm font-medium">No recent contacts yet</p>
                                            <p className="mt-1 text-xs text-muted-foreground">
                                                Send money or pay a merchant once and quick shortcuts will appear here.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-semibold">Wallet insights</p>
                                            <p className="text-xs text-muted-foreground">
                                                Helpful summaries from your latest transactions.
                                            </p>
                                        </div>
                                        <Sparkles className="h-4 w-4 text-primary" />
                                    </div>

                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm">
                                            <span className="text-muted-foreground">Incoming</span>
                                            <span className="font-semibold text-green-600 dark:text-green-400">
                                                {formatCurrency(incomingTotal.toFixed(2), 'BBD')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm">
                                            <span className="text-muted-foreground">Outgoing</span>
                                            <span className="font-semibold text-red-600 dark:text-red-400">
                                                {formatCurrency(outgoingTotal.toFixed(2), 'BBD')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 px-3 py-2.5 text-sm">
                                            <span className="text-muted-foreground">Transactions loaded</span>
                                            <span className="font-semibold">{recentEntries.length}</span>
                                        </div>
                                    </div>

                                    <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-3">
                                        <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                                            <ShieldCheck className="h-4 w-4 text-primary" />
                                            Complete profile for smoother payments
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Finish identity verification in Settings to reduce payment friction and support account protections.
                                        </p>
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="mt-3 rounded-xl"
                                            onClick={() => navigate({ to: '/settings' })}
                                        >
                                            Open Settings & KYC
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline" className="rounded-xl">
                                        <Wallet className="h-3 w-3" />
                                        Balance
                                    </Badge>
                                    <Badge variant="outline" className="rounded-xl">Live</Badge>
                                </div>
                                <CardTitle className="text-base">Spendable balance</CardTitle>
                                <CardDescription className="text-sm">
                                    Updated regularly so you can make confident payments.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
                                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                                        Available now
                                    </p>
                                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                                        {balanceQuery.isLoading
                                            ? 'Loading...'
                                            : formatCurrency(balanceQuery.data?.balance ?? '0.00', 'BBD')}
                                    </p>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        {balanceQuery.data?.wallet_id
                                            ? `Wallet ID ${balanceQuery.data.wallet_id}`
                                            : 'Your wallet is ready for send and pay actions.'}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-xl"
                                        onClick={() => navigate({ to: '/send' })}
                                    >
                                        <SendHorizontal className="h-4 w-4" />
                                        Send
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="rounded-xl"
                                        onClick={() => navigate({ to: '/pay' })}
                                    >
                                        <Receipt className="h-4 w-4" />
                                        Pay
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="rounded-3xl border-border/70 bg-background/88">
                            <CardHeader className="space-y-2 px-4 py-4 sm:px-5">
                                <div className="flex items-center justify-between gap-2">
                                    <Badge variant="outline" className="rounded-xl">
                                        <Clock className="h-3 w-3" />
                                        Activity health
                                    </Badge>
                                    <Sparkles className="h-4 w-4 text-primary" />
                                </div>
                                <CardTitle className="text-base">Smart reminders</CardTitle>
                                <CardDescription className="text-sm">
                                    Small guidance to help you avoid mistakes and move faster.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 px-4 pb-4 sm:px-5 sm:pb-5">
                                <div className="rounded-2xl border border-border/70 bg-background/80 p-3 text-sm">
                                    <p className="font-semibold">Before paying</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Confirm the merchant name and amount before entering your PIN.
                                    </p>
                                </div>
                                <div className="rounded-2xl border border-border/70 bg-background/80 p-3 text-sm">
                                    <p className="font-semibold">Before sending</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Verify the recipient details and review your recent activity to avoid duplicate transfers.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                <Card className="rounded-3xl border-border/70 bg-background/88">
                    <CardHeader className="space-y-4 border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className="rounded-xl">
                                        Transactions
                                    </Badge>
                                    <Badge variant="outline" className="rounded-xl">
                                        {filteredEntries.length} shown
                                    </Badge>
                                </div>
                                <CardTitle className="text-base sm:text-lg">
                                    Transaction center
                                </CardTitle>
                                <CardDescription className="text-sm">
                                    Search and filter the latest wallet activity right from your dashboard.
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl"
                                onClick={() => navigate({ to: '/history' })}
                            >
                                View full history
                            </Button>
                        </div>

                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="search"
                                    value={searchValue}
                                    onChange={(e) => setSearchValue(e.target.value)}
                                    placeholder="Search by type, description, or reference"
                                    className="h-10 rounded-xl border-border/70 bg-background/80 pl-9"
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {[
                                    { value: 'all' as const, label: 'All' },
                                    { value: 'incoming' as const, label: 'Money In' },
                                    { value: 'outgoing' as const, label: 'Money Out' },
                                ].map((filterOption) => (
                                    <button
                                        key={filterOption.value}
                                        type="button"
                                        onClick={() => setActivityFilter(filterOption.value)}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                                            activityFilter === filterOption.value
                                                ? 'border-primary/25 bg-primary/10 text-foreground'
                                                : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground',
                                        )}
                                    >
                                        <Sparkles className={cn('h-3.5 w-3.5', activityFilter === filterOption.value ? 'text-primary' : 'text-muted-foreground')} />
                                        {filterOption.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
                        {recentTxQuery.isLoading ? (
                            <div className="flex justify-center py-12">
                                <LoadingSpinner />
                            </div>
                        ) : filteredEntries.length > 0 ? (
                            <div className="space-y-2 sm:space-y-3">
                                {filteredEntries.slice(0, 10).map((entry) => {
                                    const isCredit = entry.entry_type === 'CR';
                                    const status = entryStatus(entry);
                                    return (
                                        <div
                                            key={`${entry.journal_id}-${entry.entry_type}-${entry.posted_at}`}
                                            className="rounded-2xl border border-border/70 bg-background/70 p-3 transition-colors hover:bg-muted/20 sm:p-3.5"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={cn(
                                                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                                    isCredit ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600',
                                                )}>
                                                    {isCredit ? (
                                                        <ArrowDownLeft className="h-4 w-4" />
                                                    ) : (
                                                        <ArrowUpRight className="h-4 w-4" />
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold">
                                                                {entryTitle(entry)}
                                                            </p>
                                                            <div className="mt-1 flex min-w-0 items-center gap-2">
                                                                <Avatar className="h-5 w-5 rounded-full border bg-background">
                                                                    <AvatarFallback className="text-[10px]">
                                                                        {getInitials(entryCounterparty(entry))}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <p className="truncate text-xs text-muted-foreground">
                                                                    {entryCounterparty(entry)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="shrink-0 text-right">
                                                            <p className={cn(
                                                                'text-sm font-semibold',
                                                                isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                                                            )}>
                                                                {isCredit ? '+' : '-'}
                                                                {formatCurrency(entry.amount, entry.currency || 'BBD')}
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                                {formatRelativeTime(entry.posted_at)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className={cn(
                                                            'inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1',
                                                            status.tone,
                                                        )}>
                                                            {status.label}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {formatDate(entry.posted_at)}
                                                        </span>
                                                        <span className="truncate text-[11px] text-muted-foreground">
                                                            {entry.txn_type}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Clock />}
                                title={
                                    searchValue || activityFilter !== 'all'
                                        ? 'No matching transactions'
                                        : 'No transactions yet'
                                }
                                description={
                                    searchValue || activityFilter !== 'all'
                                        ? 'Try a different search or filter, or open full history.'
                                        : 'Your latest transfers and merchant payments will appear here.'
                                }
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
