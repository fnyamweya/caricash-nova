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
import { ChevronDown, Clock, RefreshCw, Search } from 'lucide-react';
import { MerchantHero, MerchantSection, MerchantSegmentedFilters } from '../components/merchant-ui.js';
import {
    entryDisplayAmount,
    parseMerchantDescription,
    txnTypeBadge,
    type StatementEntry,
    type StatementResponse,
} from '../lib/merchant-transactions.js';

type TabFilter = 'all' | 'incoming' | 'outgoing';
type DateFilter = 'all' | 'today' | '7d' | '30d';

export function HistoryPage() {
    const { actor } = useAuth();
    const api = useApi();
    const [tab, setTab] = useState<TabFilter>('all');
    const [dateFilter, setDateFilter] = useState<DateFilter>('7d');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const statementQuery = useQuery<StatementResponse>({
        queryKey: ['merchant-history-statement', actor?.id],
        queryFn: () => api.get(`/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=240`),
        enabled: !!actor?.id,
    });

    const entries = statementQuery.data?.entries ?? [];
    const now = Date.now();

    const filtered = useMemo(() => {
        let list = tab === 'all'
            ? entries
            : entries.filter((entry) => (tab === 'incoming' ? entry.entry_type === 'CR' : entry.entry_type === 'DR'));

        if (dateFilter !== 'all') {
            const windowMs = dateFilter === 'today'
                ? 24 * 60 * 60 * 1000
                : dateFilter === '7d'
                    ? 7 * 24 * 60 * 60 * 1000
                    : 30 * 24 * 60 * 60 * 1000;
            list = list.filter((entry) => now - new Date(entry.posted_at).getTime() <= windowMs);
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter((entry) => {
                const parsed = parseMerchantDescription(entry.line_description).label.toLowerCase();
                return parsed.includes(term)
                    || entry.txn_type.toLowerCase().includes(term)
                    || entry.journal_id.toLowerCase().includes(term)
                    || (entry.correlation_id ?? '').toLowerCase().includes(term);
            });
        }

        return list;
    }, [entries, tab, dateFilter, searchTerm, now]);

    const incomingCount = entries.filter((entry) => entry.entry_type === 'CR').length;
    const outgoingCount = entries.filter((entry) => entry.entry_type === 'DR').length;

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Activity Timeline"
                    description="Search, filter, and inspect every merchant wallet entry with a smoother mobile-first history view."
                    badge="Merchant statement history"
                    actions={(
                        <Button variant="outline" size="sm" className="rounded-xl" onClick={() => void statementQuery.refetch()} disabled={statementQuery.isFetching}>
                            <RefreshCw className={cn('h-4 w-4', statementQuery.isFetching && 'animate-spin')} />
                            {statementQuery.isFetching ? 'Refreshing' : 'Refresh'}
                        </Button>
                    )}
                >
                    <div className="grid gap-2 sm:grid-cols-3">
                        <TimelineStat label="Entries" value={String(entries.length)} helper="Statement rows loaded" />
                        <TimelineStat label="Incoming" value={String(incomingCount)} helper="Credits" tone="emerald" />
                        <TimelineStat label="Outgoing" value={String(outgoingCount)} helper="Debits" tone="rose" />
                    </div>
                </MerchantHero>

                <MerchantSection title="Filters & Search" description="Narrow the timeline by direction, period, and keywords.">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <MerchantSegmentedFilters<TabFilter>
                                value={tab}
                                onChange={setTab}
                                options={[
                                    { value: 'all', label: 'All', count: entries.length },
                                    { value: 'incoming', label: 'Incoming', count: incomingCount },
                                    { value: 'outgoing', label: 'Outgoing', count: outgoingCount },
                                ]}
                            />
                            <div className="relative w-full xl:max-w-sm">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search description, ref, correlation"
                                    className="h-10 rounded-xl pl-9"
                                />
                            </div>
                        </div>
                        <MerchantSegmentedFilters<DateFilter>
                            value={dateFilter}
                            onChange={setDateFilter}
                            options={[
                                { value: 'today', label: 'Today' },
                                { value: '7d', label: '7 Days' },
                                { value: '30d', label: '30 Days' },
                                { value: 'all', label: 'All Time' },
                            ]}
                        />
                    </div>
                </MerchantSection>

                <MerchantSection
                    title="Timeline"
                    description="Tap any row to expand for reference details and transaction metadata."
                    actions={<Badge variant="outline" className="rounded-full">{filtered.length} results</Badge>}
                >
                    {statementQuery.isLoading ? (
                        <div className="flex justify-center py-10"><LoadingSpinner /></div>
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            icon={<Clock />}
                            title="No transactions found"
                            description="Try broadening your filters or clear the search term to see more history."
                        />
                    ) : (
                        <div className="space-y-2">
                            <AnimatePresence initial={false}>
                                {filtered.map((entry) => {
                                    const rowId = `${entry.journal_id}-${entry.entry_type}`;
                                    return (
                                        <TimelineRow
                                            key={rowId}
                                            entry={entry}
                                            expanded={expandedId === rowId}
                                            onToggle={() => setExpandedId(expandedId === rowId ? null : rowId)}
                                        />
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </MerchantSection>
            </div>
        </PageTransition>
    );
}

function TimelineRow({
    entry,
    expanded,
    onToggle,
}: {
    entry: StatementEntry;
    expanded: boolean;
    onToggle: () => void;
}) {
    const isCredit = entry.entry_type === 'CR';
    const parsed = parseMerchantDescription(entry.line_description);
    const badge = txnTypeBadge(entry.txn_type);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="overflow-hidden rounded-2xl border border-border/70 bg-background/85"
        >
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-start justify-between gap-3 p-3 text-left hover:bg-accent/20"
            >
                <div className="min-w-0 flex-1">
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
                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className={cn('text-sm font-semibold', isCredit ? 'text-emerald-700' : 'text-rose-700')}>
                            {isCredit ? '+' : '-'}{formatCurrency(entryDisplayAmount(entry), entry.currency || 'BBD')}
                        </p>
                        <p className="text-xs text-muted-foreground">{isCredit ? 'Incoming' : 'Outgoing'}</p>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </div>
            </button>

            <AnimatePresence initial={false}>
                {expanded ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="border-t border-border/70 bg-muted/15 p-3">
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                                <DetailItem label="Transaction Type" value={entry.txn_type} />
                                <DetailItem label="Direction" value={entry.entry_type === 'CR' ? 'Credit' : 'Debit'} />
                                <DetailItem label="Reference" value={entry.journal_id} mono />
                                <DetailItem label="Correlation ID" value={entry.correlation_id || '—'} mono />
                            </div>
                            {entry.line_description ? (
                                <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-background/70 p-3 text-xs text-muted-foreground">
                                    {entry.line_description}
                                </div>
                            ) : null}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </motion.div>
    );
}

function TimelineStat({ label, value, helper, tone = 'slate' }: { label: string; value: string; helper: string; tone?: 'slate' | 'emerald' | 'rose' }) {
    return (
        <div className={cn(
            'rounded-2xl border p-3',
            tone === 'emerald' && 'border-emerald-200 bg-emerald-500/8',
            tone === 'rose' && 'border-rose-200 bg-rose-500/8',
            tone === 'slate' && 'border-border/70 bg-background/70',
        )}>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{helper}</p>
        </div>
    );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="rounded-xl border border-border/60 bg-background/70 p-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-sm', mono && 'font-mono text-xs break-all')}>{value}</p>
        </div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
