import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
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
import {
    ArrowRightLeft,
    Clock,
    CreditCard,
    QrCode,
    Search,
    Settings,
    Sparkles,
    Store,
    TrendingUp,
    Wallet,
    Users,
    ChevronRight,
    ShieldCheck,
} from 'lucide-react';
import { MerchantActionTile, MerchantHero, MerchantMetricCard, MerchantSection, MerchantSegmentedFilters } from '../components/merchant-ui.js';
import { useMerchantWorkspace } from '../lib/merchant-workspace.js';
import {
    entryDisplayAmount,
    isToday,
    parseMerchantDescription,
    txnTypeBadge,
    type StatementEntry,
    type StatementResponse,
} from '../lib/merchant-transactions.js';

interface BalanceResponse {
    balance: string;
    currency: string;
    wallet_id: string;
}

type ActivityFilter = 'all' | 'incoming' | 'outgoing';

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();
    const { stores, activeStore, storesQuery } = useMerchantWorkspace();
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const balanceQuery = useQuery<BalanceResponse>({
        queryKey: ['merchant-balance', actor?.id],
        queryFn: () => api.get(`/wallets/MERCHANT/${actor!.id}/BBD/balance`),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const statementQuery = useQuery<StatementResponse>({
        queryKey: ['merchant-statement-dashboard', actor?.id],
        queryFn: () => api.get(`/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=120`),
        enabled: !!actor?.id,
        refetchInterval: 45_000,
    });

    const entries = statementQuery.data?.entries ?? [];
    const credits = entries.filter((entry) => entry.entry_type === 'CR');
    const debits = entries.filter((entry) => entry.entry_type === 'DR');
    const todayCredits = credits.filter((entry) => isToday(entry.posted_at));

    const todayTotal = todayCredits.reduce((sum, entry) => sum + Number(entryDisplayAmount(entry)), 0);
    const totalCollected = credits.reduce((sum, entry) => sum + Number(entryDisplayAmount(entry)), 0);
    const totalMoved = debits.reduce((sum, entry) => sum + Number(entryDisplayAmount(entry)), 0);

    const filteredActivity = useMemo(() => {
        const byType = activityFilter === 'all'
            ? entries
            : entries.filter((entry) => (activityFilter === 'incoming' ? entry.entry_type === 'CR' : entry.entry_type === 'DR'));
        if (!searchTerm.trim()) return byType.slice(0, 12);
        const term = searchTerm.toLowerCase();
        return byType.filter((entry) => {
            const parsed = parseMerchantDescription(entry.line_description).label.toLowerCase();
            return parsed.includes(term) || entry.txn_type.toLowerCase().includes(term) || entry.journal_id.toLowerCase().includes(term);
        }).slice(0, 12);
    }, [entries, activityFilter, searchTerm]);

    const topStores = stores.slice(0, 4);

    return (
        <PageTransition>
            <div className="flex flex-col gap-4 md:gap-5">
                <MerchantHero
                    title="Merchant Operations Hub"
                    description="Collect customer payments, request settlement, and move funds across your stores from one fluid workspace."
                    badge={activeStore ? `Active store: ${activeStore.store_code}` : 'Merchant overview'}
                    actions={(
                        <>
                            <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-600/90" onClick={() => navigate({ to: '/qr-code' })}>
                                <QrCode className="h-4 w-4" />
                                Collect via QR
                            </Button>
                            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate({ to: '/transfer' })}>
                                <ArrowRightLeft className="h-4 w-4" />
                                Transfer & Settle
                            </Button>
                        </>
                    )}
                >
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <MerchantMetricCard
                            label="Available balance"
                            value={balanceQuery.isLoading ? 'Loading…' : formatCurrency(balanceQuery.data?.balance ?? '0', 'BBD')}
                            helper={balanceQuery.data?.wallet_id ? `Wallet ${balanceQuery.data.wallet_id.slice(0, 10)}…` : 'Merchant wallet'}
                            icon={<Wallet className="h-4 w-4" />}
                            tone="emerald"
                        />
                        <MerchantMetricCard
                            label="Collected today"
                            value={formatCurrency(todayTotal.toFixed(2), 'BBD')}
                            helper={`${todayCredits.length} incoming payment${todayCredits.length === 1 ? '' : 's'}`}
                            icon={<CreditCard className="h-4 w-4" />}
                            tone="blue"
                        />
                        <MerchantMetricCard
                            label="Total collected"
                            value={formatCurrency(totalCollected.toFixed(2), 'BBD')}
                            helper={`${credits.length} credits on statement`}
                            icon={<TrendingUp className="h-4 w-4" />}
                            tone="amber"
                        />
                        <MerchantMetricCard
                            label="Funds moved"
                            value={formatCurrency(totalMoved.toFixed(2), 'BBD')}
                            helper={`${debits.length} outgoing transactions`}
                            icon={<ArrowRightLeft className="h-4 w-4" />}
                            tone="slate"
                        />
                    </div>
                </MerchantHero>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MerchantActionTile
                        title="Collect Payments"
                        description="Open your QR counter flow, create amount-specific QR codes, and accept walk-in payments faster."
                        icon={<QrCode className="h-5 w-5 text-emerald-700" />}
                        cta="Collect"
                        tone="emerald"
                        onClick={() => navigate({ to: '/qr-code' })}
                    />
                    <MerchantActionTile
                        title="View Payment Feed"
                        description="Track incoming customer payments with filters for amount, reference, and timing."
                        icon={<CreditCard className="h-5 w-5 text-blue-700" />}
                        cta="Payments"
                        tone="blue"
                        onClick={() => navigate({ to: '/payments' })}
                    />
                    <MerchantActionTile
                        title="Transfer & Settlement"
                        description="Move funds to another merchant store or prepare a settlement request to operations."
                        icon={<ArrowRightLeft className="h-5 w-5 text-orange-700" />}
                        cta="Move"
                        tone="orange"
                        onClick={() => navigate({ to: '/transfer' })}
                    />
                    <MerchantActionTile
                        title="Stores, Team & Settings"
                        description="Manage branches, team users, KYC progress, and merchant profile preferences."
                        icon={<Settings className="h-5 w-5 text-violet-700" />}
                        cta="Configure"
                        tone="violet"
                        onClick={() => navigate({ to: '/settings' })}
                    />
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.05fr_1.35fr]">
                    <MerchantSection
                        title="Multi-store Workspace"
                        description="Seamlessly switch between branches while keeping collections and team actions in context."
                        actions={(
                            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate({ to: '/settings' })}>
                                <Store className="h-4 w-4" />
                                Manage Stores
                            </Button>
                        )}
                    >
                        {storesQuery.isLoading ? (
                            <div className="flex justify-center py-8"><LoadingSpinner /></div>
                        ) : topStores.length > 0 ? (
                            <div className="space-y-2">
                                {topStores.map((store) => {
                                    const active = activeStore?.store_code === store.store_code;
                                    return (
                                        <motion.button
                                            key={store.store_code}
                                            type="button"
                                            whileTap={{ scale: 0.995 }}
                                            onClick={() => navigate({ to: '/settings' })}
                                            className={cn(
                                                'flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors',
                                                active ? 'border-emerald-300 bg-emerald-500/8' : 'border-border/70 hover:bg-accent/40',
                                            )}
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', active ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                                                    <Store className="h-4 w-4" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold">{store.name}</p>
                                                    <p className="truncate text-xs text-muted-foreground">{store.store_code}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant={active ? 'default' : 'outline'} className={cn(active ? 'bg-emerald-600 hover:bg-emerald-600' : '', 'rounded-full')}>
                                                    {active ? 'Active' : (store.state ?? 'Store')}
                                                </Badge>
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                        </motion.button>
                                    );
                                })}
                                {stores.length > topStores.length ? (
                                    <Button variant="ghost" className="w-full justify-between rounded-xl" onClick={() => navigate({ to: '/settings' })}>
                                        View all {stores.length} stores
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Store />}
                                title="No branch stores yet"
                                description="Add your first store branch in Settings to unlock quick store switching and team segmentation."
                            />
                        )}

                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">KYC & trust</p>
                                <p className="mt-1 text-sm font-semibold">Keep merchant KYC current</p>
                                <p className="mt-1 text-xs text-muted-foreground">Verified stores experience smoother risk checks and more predictable collection operations.</p>
                            </div>
                            <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Team operations</p>
                                <p className="mt-1 text-sm font-semibold">Store-scoped access controls</p>
                                <p className="mt-1 text-xs text-muted-foreground">Use the active store switcher before adding cashiers or managers so permissions stay organized.</p>
                            </div>
                        </div>
                    </MerchantSection>

                    <MerchantSection
                        title="Transaction Center"
                        description="A live preview of collections and outgoing movement across your merchant wallet."
                        actions={(
                            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate({ to: '/history' })}>
                                <Clock className="h-4 w-4" />
                                Full History
                            </Button>
                        )}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <MerchantSegmentedFilters<ActivityFilter>
                                value={activityFilter}
                                onChange={setActivityFilter}
                                options={[
                                    { value: 'all', label: 'All', count: entries.length },
                                    { value: 'incoming', label: 'Incoming', count: credits.length },
                                    { value: 'outgoing', label: 'Outgoing', count: debits.length },
                                ]}
                            />
                            <div className="relative w-full sm:max-w-xs">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search description or ref"
                                    className="h-10 rounded-xl pl-9"
                                />
                            </div>
                        </div>

                        {statementQuery.isLoading ? (
                            <div className="flex justify-center py-10"><LoadingSpinner /></div>
                        ) : filteredActivity.length === 0 ? (
                            <EmptyState
                                icon={<Clock />}
                                title="No activity yet"
                                description="Incoming payments and merchant transfers will appear here as your stores begin collecting."
                            />
                        ) : (
                            <div className="space-y-2">
                                <AnimatePresence initial={false}>
                                    {filteredActivity.map((entry) => (
                                        <ActivityRow
                                            key={`${entry.journal_id}-${entry.entry_type}-${entry.posted_at}`}
                                            entry={entry}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </MerchantSection>
                </div>
            </div>
        </PageTransition>
    );
}

function ActivityRow({ entry }: { entry: StatementEntry }) {
    const isCredit = entry.entry_type === 'CR';
    const parsed = parseMerchantDescription(entry.line_description);
    const badge = txnTypeBadge(entry.txn_type);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-2xl border border-border/70 bg-background/75 p-3 shadow-sm"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-3">
                    <div className={cn(
                        'mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl border',
                        isCredit ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700' : 'border-rose-200 bg-rose-500/10 text-rose-700',
                    )}>
                        {isCredit ? <CreditCard className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold">{parsed.label}</p>
                            <Badge
                                variant="outline"
                                className={cn(
                                    'rounded-full text-[11px]',
                                    badge.tone === 'emerald' && 'border-emerald-200 bg-emerald-500/8 text-emerald-700',
                                    badge.tone === 'blue' && 'border-blue-200 bg-blue-500/8 text-blue-700',
                                    badge.tone === 'amber' && 'border-amber-200 bg-amber-500/8 text-amber-700',
                                    badge.tone === 'rose' && 'border-rose-200 bg-rose-500/8 text-rose-700',
                                )}
                            >
                                {badge.label}
                            </Badge>
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
                    <p className={cn('text-sm font-semibold', isCredit ? 'text-emerald-700' : 'text-rose-700')}>
                        {isCredit ? '+' : '-'}{formatCurrency(entryDisplayAmount(entry), entry.currency || 'BBD')}
                    </p>
                    <p className="text-xs text-muted-foreground">{isCredit ? 'Inflow' : 'Outflow'}</p>
                </div>
            </div>

            {(parsed.detail || entry.line_description) ? (
                <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                    {entry.line_description ?? parsed.detail}
                </div>
            ) : null}
        </motion.div>
    );
}

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(' ');
}
