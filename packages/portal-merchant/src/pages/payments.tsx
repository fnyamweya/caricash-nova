import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
    Badge,
    Button,
    EmptyState,
    Input,
    LoadingSpinner,
    PageTransition,
    formatCurrency,
    formatDate,
    formatRelativeTime,
    useApi,
    useAuth,
} from '@caricash/ui';
import { CreditCard, Download, QrCode, RefreshCw, Search, Sparkles, Store } from 'lucide-react';
import { MerchantHero, MerchantMetricCard, MerchantSection, MerchantSegmentedFilters } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';
import {
    entryAmount,
    entryDisplayAmount,
    parseMerchantDescription,
    txnTypeBadge,
    type StatementEntry,
    type StatementResponse,
} from '../lib/merchant-transactions.js';

type PaymentFilter = 'all' | 'large' | 'recent';

export function PaymentsPage() {
    const { actor } = useAuth();
    const api = useApi();
    const { activeStore } = useMerchantWorkspace();
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState<PaymentFilter>('all');

    const statementQuery = useQuery<StatementResponse>({
        queryKey: ['merchant-payments-statement', actor?.id],
        queryFn: () => api.get(`/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=160`),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const entries = statementQuery.data?.entries ?? [];
    const incoming = entries.filter((entry) => entry.entry_type === 'CR');

    const filtered = useMemo(() => {
        const base = filter === 'all'
            ? incoming
            : filter === 'large'
                ? incoming.filter((entry) => entryAmount(entry) >= 200)
                : incoming.filter((entry) => Date.now() - new Date(entry.posted_at).getTime() < 24 * 60 * 60 * 1000);

        if (!searchTerm.trim()) return base;
        const term = searchTerm.toLowerCase();
        return base.filter((entry) => {
            const parsed = parseMerchantDescription(entry.line_description).label.toLowerCase();
            return parsed.includes(term)
                || entry.txn_type.toLowerCase().includes(term)
                || entry.journal_id.toLowerCase().includes(term);
        });
    }, [incoming, filter, searchTerm]);

    const totalReceived = incoming.reduce((sum, entry) => sum + entryAmount(entry), 0);
    const avgTicket = incoming.length ? totalReceived / incoming.length : 0;
    const largest = incoming.reduce((max, entry) => Math.max(max, entryAmount(entry)), 0);

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Collection Workspace"
                    description="Monitor incoming customer payments, find specific transactions quickly, and stay on top of collection trends across stores."
                    badge={activeStore ? `Collecting for ${activeStore.store_code}` : 'Incoming payments'}
                    actions={(
                        <>
                            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void statementQuery.refetch()} disabled={statementQuery.isFetching}>
                                <RefreshCw className={cn('h-4 w-4', statementQuery.isFetching && 'animate-spin')} />
                                {statementQuery.isFetching ? 'Refreshing' : 'Refresh'}
                            </Button>
                            <Button variant="outline" size="sm" className="rounded-xl" disabled>
                                <Download className="h-4 w-4" />
                                Export
                            </Button>
                        </>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MerchantMetricCard label="Incoming payments" value={incoming.length} helper="Credits posted to merchant wallet" icon={<CreditCard className="h-4 w-4" />} tone="emerald" />
                        <MerchantMetricCard label="Total received" value={formatCurrency(totalReceived.toFixed(2), 'BBD')} helper="All visible collection history" icon={<Sparkles className="h-4 w-4" />} tone="blue" />
                        <MerchantMetricCard label="Average ticket" value={formatCurrency(avgTicket.toFixed(2), 'BBD')} helper="Mean payment amount" icon={<QrCode className="h-4 w-4" />} tone="amber" />
                        <MerchantMetricCard label="Largest payment" value={formatCurrency(largest.toFixed(2), 'BBD')} helper={statementQuery.data?.account_id ? `Acct ${statementQuery.data.account_id.slice(0, 10)}…` : 'Merchant account'} icon={<Store className="h-4 w-4" />} tone="slate" />
                    </div>
                </MerchantHero>

                <MerchantSection
                    title="Payment Feed"
                    description="Search customer payments by description, reference, or type. Optimized for mobile operations and cashier workflows."
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <MerchantSegmentedFilters<PaymentFilter>
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: 'all', label: 'All', count: incoming.length },
                                { value: 'recent', label: '24h', count: incoming.filter((entry) => Date.now() - new Date(entry.posted_at).getTime() < 24 * 60 * 60 * 1000).length },
                                { value: 'large', label: 'Large', count: incoming.filter((entry) => entryAmount(entry) >= 200).length },
                            ]}
                        />
                        <div className="relative w-full lg:max-w-sm">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search payment feed"
                                className="h-10 rounded-xl pl-9"
                            />
                        </div>
                    </div>

                    {statementQuery.isLoading ? (
                        <div className="flex justify-center py-12"><LoadingSpinner /></div>
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            icon={<CreditCard />}
                            title="No payments found"
                            description="Try a different filter or wait for new customer payments to arrive in your wallet."
                        />
                    ) : (
                        <div className="grid gap-2 sm:gap-3">
                            <AnimatePresence initial={false}>
                                {filtered.map((entry) => (
                                    <PaymentCard key={`${entry.journal_id}-${entry.posted_at}`} entry={entry} />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </MerchantSection>
            </div>
        </PageTransition>
    );
}

function PaymentCard({ entry }: { entry: StatementEntry }) {
    const parsed = parseMerchantDescription(entry.line_description);
    const badge = txnTypeBadge(entry.txn_type);
    const amount = entryDisplayAmount(entry);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="rounded-2xl border border-border/70 bg-background/85 p-3 shadow-sm"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-500/10 text-emerald-700">
                        <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{parsed.label}</p>
                            <Badge variant="outline" className={cn(
                                'rounded-full text-[11px]',
                                badge.tone === 'emerald' && 'border-emerald-200 bg-emerald-500/8 text-emerald-700',
                                badge.tone === 'blue' && 'border-blue-200 bg-blue-500/8 text-blue-700',
                                badge.tone === 'amber' && 'border-amber-200 bg-amber-500/8 text-amber-700',
                                badge.tone === 'rose' && 'border-rose-200 bg-rose-500/8 text-rose-700',
                            )}>{badge.label}</Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(entry.posted_at)}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(entry.posted_at)}</span>
                            <span>•</span>
                            <span className="font-mono">{entry.journal_id.slice(0, 12)}…</span>
                        </div>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-base font-semibold text-emerald-700">+{formatCurrency(amount, entry.currency || 'BBD')}</p>
                    <p className="text-xs text-muted-foreground">Incoming collection</p>
                </div>
            </div>
        </motion.div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
