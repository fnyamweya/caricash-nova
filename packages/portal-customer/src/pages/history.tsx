import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowDownLeft,
    ArrowUpRight,
    ChevronDown,
    Clock,
    ReceiptText,
    Search,
    SendHorizontal,
    ShieldCheck,
    ShoppingBag,
    Sparkles,
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
    PageTransition,
    cn,
    formatCurrency,
    formatDate,
    formatRelativeTime,
    getInitials,
    useApi,
    useAuth,
    type Transaction,
} from '@caricash/ui';
import {
    type CustomerFlowStep,
    CustomerFlowStepPills,
    CustomerStickyActionBar,
} from '../components/customer-flow-ui.js';

const CREDIT_TYPES = new Set(['DEPOSIT', 'CREDIT', 'INCOMING', 'RECEIVE', 'REFUND']);

type HistoryTab = 'all' | 'in' | 'out';

function isCredit(tx: Transaction): boolean {
    if (tx.entry_type) return tx.entry_type === 'CR';
    return CREDIT_TYPES.has(tx.type.toUpperCase());
}

function txTitle(tx: Transaction): string {
    if (isCredit(tx)) return 'Money received';
    if (/merchant|payment|pay/i.test(tx.type)) return 'Merchant payment';
    if (/p2p|transfer|send/i.test(tx.type)) return 'Money sent';
    return tx.type || 'Wallet transaction';
}

function txCounterparty(tx: Transaction): string {
    return tx.description || `Ref ${tx.id.slice(0, 10)}…`;
}

function txStatusTone(tx: Transaction): string {
    const normalized = tx.state.toLowerCase();
    if (normalized.includes('success') || normalized.includes('posted') || normalized.includes('complete')) {
        return 'bg-green-500/10 text-green-700 ring-green-500/20 dark:text-green-300';
    }
    if (normalized.includes('pending')) {
        return 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300';
    }
    if (normalized.includes('fail') || normalized.includes('error')) {
        return 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300';
    }
    return 'bg-muted text-muted-foreground ring-border';
}

export function HistoryPage() {
    const api = useApi();
    const { actor } = useAuth();
    const navigate = useNavigate();

    const [tab, setTab] = useState<HistoryTab>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedTxId, setExpandedTxId] = useState<string | null>(null);

    const txQuery = useQuery<{ items: Transaction[] }>({
        queryKey: ['transactions', actor?.id],
        queryFn: async () => {
            try {
                return await api.get<{ items: Transaction[] }>(
                    `/tx?ownerType=CUSTOMER&ownerId=${encodeURIComponent(actor!.id)}&currency=BBD&pageSize=200`,
                );
            } catch (err) {
                if (err instanceof ApiError && err.status === 501) {
                    return { items: [] };
                }
                throw err;
            }
        },
        enabled: !!actor?.id,
    });

    const transactions = txQuery.data?.items ?? [];

    const filteredTransactions = useMemo(() => {
        const normalized = searchTerm.trim().toLowerCase();
        return transactions.filter((tx) => {
            const credit = isCredit(tx);
            if (tab === 'in' && !credit) return false;
            if (tab === 'out' && credit) return false;
            if (!normalized) return true;
            return [tx.type, tx.description, tx.state, tx.currency, tx.id]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalized));
        });
    }, [searchTerm, tab, transactions]);

    const metrics = useMemo(() => {
        let inboundCount = 0;
        let outboundCount = 0;
        let inboundTotal = 0;
        let outboundTotal = 0;
        for (const tx of transactions) {
            const amount = Number(tx.amount);
            const numeric = Number.isFinite(amount) ? amount : 0;
            if (isCredit(tx)) {
                inboundCount += 1;
                inboundTotal += numeric;
            } else {
                outboundCount += 1;
                outboundTotal += numeric;
            }
        }
        return { inboundCount, outboundCount, inboundTotal, outboundTotal };
    }, [transactions]);

    const activeTabLabel =
        tab === 'all' ? 'All activity' : tab === 'in' ? 'Money in' : 'Money out';

    const stepItems: CustomerFlowStep[] = [
        { key: 'load', label: 'Load', state: txQuery.isLoading ? 'active' : 'done' },
        { key: 'filter', label: 'Filter', state: searchTerm || tab !== 'all' ? 'done' : 'active' },
        { key: 'review', label: 'Review', state: filteredTransactions.length > 0 ? 'done' : 'upcoming' },
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
                                    <Badge variant="outline" className="rounded-xl">Activity Center</Badge>
                                    <Badge variant="outline" className="rounded-xl">{transactions.length} transactions</Badge>
                                    <Badge variant="outline" className="rounded-xl inline-flex items-center gap-1">
                                        <ShieldCheck className="h-3 w-3 text-primary" />
                                        Wallet history
                                    </Badge>
                                </div>
                                <CardTitle className="text-lg tracking-tight sm:text-xl">
                                    Track your money movement
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Search, filter, and inspect transfers and merchant payments from one interactive timeline.
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl"
                                    onClick={() => void txQuery.refetch()}
                                    disabled={txQuery.isFetching}
                                >
                                    {txQuery.isFetching ? 'Refreshing…' : 'Refresh'}
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

                        <CustomerFlowStepPills steps={stepItems} />
                    </CardHeader>

                    <CardContent className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <motion.div layout className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Money in</p>
                                <p className="mt-2 text-lg font-semibold text-green-600 dark:text-green-400">
                                    {formatCurrency(metrics.inboundTotal.toFixed(2), 'BBD')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{metrics.inboundCount} transactions</p>
                            </motion.div>
                            <motion.div layout className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Money out</p>
                                <p className="mt-2 text-lg font-semibold text-red-600 dark:text-red-400">
                                    {formatCurrency(metrics.outboundTotal.toFixed(2), 'BBD')}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{metrics.outboundCount} transactions</p>
                            </motion.div>
                            <motion.div layout className="rounded-2xl border border-border/70 bg-background/80 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Visible now</p>
                                <p className="mt-2 text-lg font-semibold">{filteredTransactions.length}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{activeTabLabel}</p>
                            </motion.div>
                            <motion.div layout className="rounded-2xl border border-primary/15 bg-primary/5 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">Tip</p>
                                <p className="mt-2 text-sm font-semibold">Review before repeat sends</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Use your recent contacts on the dashboard to prefill repeat actions.
                                </p>
                            </motion.div>
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search type, description, status, or reference"
                                        className="h-10 rounded-xl border-border/70 bg-background/80 pl-9"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {[
                                        { value: 'all' as const, label: 'All' },
                                        { value: 'in' as const, label: 'Money In' },
                                        { value: 'out' as const, label: 'Money Out' },
                                    ].map((option) => (
                                        <motion.button
                                            key={option.value}
                                            type="button"
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => setTab(option.value)}
                                            className={cn(
                                                'inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
                                                tab === option.value
                                                    ? 'border-primary/25 bg-primary/10 text-foreground'
                                                    : 'border-border/70 bg-background/70 text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            <Sparkles className={cn('h-3.5 w-3.5', tab === option.value ? 'text-primary' : 'text-muted-foreground')} />
                                            {option.label}
                                        </motion.button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-3xl border-border/70 bg-background/88">
                    <CardHeader className="space-y-2 border-b border-border/60 px-4 py-4 sm:px-5">
                        <CardTitle className="text-base sm:text-lg">Transaction Timeline</CardTitle>
                        <CardDescription className="text-sm">
                            Tap a transaction to expand details and inspect status, references, and timestamps.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 py-4 sm:px-5 sm:py-5">
                        {txQuery.isLoading ? (
                            <div className="flex justify-center py-12">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                    className="rounded-full border-2 border-primary/20 border-t-primary p-2"
                                >
                                    <Clock className="h-5 w-5 text-primary" />
                                </motion.div>
                            </div>
                        ) : filteredTransactions.length > 0 ? (
                            <motion.div layout className="space-y-2.5">
                                {filteredTransactions.map((tx, index) => {
                                    const credit = isCredit(tx);
                                    const expanded = expandedTxId === tx.id;
                                    return (
                                        <motion.div
                                            key={tx.id}
                                            layout
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.18) }}
                                            className="overflow-hidden rounded-2xl border border-border/70 bg-background/70"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setExpandedTxId((current) => current === tx.id ? null : tx.id)}
                                                className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/20 sm:p-3.5"
                                            >
                                                <div className={cn(
                                                    'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                                                    credit ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600',
                                                )}>
                                                    {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-semibold">{txTitle(tx)}</p>
                                                            <div className="mt-1 flex items-center gap-2">
                                                                <Avatar className="h-5 w-5 rounded-full border bg-background">
                                                                    <AvatarFallback className="text-[10px]">
                                                                        {getInitials(txCounterparty(tx))}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <p className="truncate text-xs text-muted-foreground">
                                                                    {txCounterparty(tx)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            <p className={cn(
                                                                'text-sm font-semibold',
                                                                credit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                                                            )}>
                                                                {credit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                                                {formatRelativeTime(tx.created_at)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className={cn('inline-flex rounded-full px-2 py-1 text-[11px] font-medium ring-1', txStatusTone(tx))}>
                                                            {tx.state}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">{tx.type}</span>
                                                        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                                                    </div>
                                                </div>
                                            </button>

                                            <AnimatePresence initial={false}>
                                                {expanded ? (
                                                    <motion.div
                                                        key="details"
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="grid gap-2 border-t border-border/60 bg-background/55 p-3 text-xs sm:grid-cols-2">
                                                            <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                                                                <p className="text-muted-foreground">Reference</p>
                                                                <p className="mt-1 truncate font-medium">{tx.id}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                                                                <p className="text-muted-foreground">Date</p>
                                                                <p className="mt-1 font-medium">{formatDate(tx.created_at)}</p>
                                                            </div>
                                                            <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 sm:col-span-2">
                                                                <p className="text-muted-foreground">Description</p>
                                                                <p className="mt-1 break-words font-medium">
                                                                    {tx.description || 'No description provided'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                ) : null}
                                            </AnimatePresence>
                                        </motion.div>
                                    );
                                })}
                            </motion.div>
                        ) : (
                            <EmptyState
                                icon={<Clock />}
                                title={searchTerm || tab !== 'all' ? 'No matching transactions' : 'No transactions yet'}
                                description={
                                    searchTerm || tab !== 'all'
                                        ? 'Try a different search term or activity filter.'
                                        : 'Transactions will appear here after you send money or pay a merchant.'
                                }
                            />
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <CustomerStickyActionBar
                title={activeTabLabel}
                subtitle={
                    filteredTransactions.length > 0
                        ? `${filteredTransactions.length} transaction${filteredTransactions.length === 1 ? '' : 's'}`
                        : 'Start a transfer or payment to build your activity feed'
                }
                actionLabel="New Send"
                onAction={() => navigate({ to: '/send' })}
                icon={<SendHorizontal className="h-4 w-4" />}
            />
        </PageTransition>
    );
}
