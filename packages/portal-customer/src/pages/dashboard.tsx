import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    SendHorizontal,
    ShoppingBag,
    Wallet,
    Clock,
    ArrowDownLeft,
    ArrowUpRight,
} from 'lucide-react';
import {
    useAuth,
    useApi,
    ApiError,
    PageHeader,
    PageTransition,
    BalanceCard,
    StatCard,
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    EmptyState,
    ActionCard,
    LoadingSpinner,
    formatCurrency,
    formatDate,
} from '@caricash/ui';

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

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const balanceQuery = useQuery({
        queryKey: ['balance', actor?.id],
        queryFn: () =>
            api.get<BalanceResponse>(
                `/wallets/CUSTOMER/${actor!.id}/BBD/balance`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const recentTxQuery = useQuery<StatementResponse>({
        queryKey: ['customer-dashboard-recent-transactions', actor?.id],
        queryFn: async () => {
            try {
                return await api.get<StatementResponse>(
                    `/wallets/CUSTOMER/${actor!.id}/BBD/statement?limit=5`,
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

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Dashboard"
                    description="Welcome back to CariCash"
                />

                {/* Balance */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <BalanceCard
                        balance={balanceQuery.data?.balance ?? '0.00'}
                        currency="BBD"
                        label="Wallet Balance"
                        loading={balanceQuery.isLoading}
                    />
                    <StatCard
                        title="Currency"
                        value="BBD"
                        description="Barbadian Dollar"
                        icon={<Wallet className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Account"
                        value={actor?.name ?? '—'}
                        description="Customer"
                        icon={<Wallet className="h-4 w-4" />}
                    />
                </div>

                {/* Quick actions */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ActionCard
                        title="Send Money"
                        description="Transfer funds to another CariCash customer"
                        icon={<SendHorizontal className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/send' })}
                    />

                    <ActionCard
                        title="Pay Merchant"
                        description="Pay at a registered CariCash merchant"
                        icon={<ShoppingBag className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/pay' })}
                    />
                </div>

                {/* Recent transactions */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-3">
                        <CardTitle className="text-base">Recent Transactions</CardTitle>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ to: '/history' })}
                        >
                            View History
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {recentTxQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner />
                            </div>
                        ) : recentEntries.length > 0 ? (
                            <div className="space-y-2">
                                {recentEntries.map((entry) => {
                                    const isCredit = entry.entry_type === 'CR';
                                    return (
                                        <div
                                            key={`${entry.journal_id}-${entry.entry_type}-${entry.posted_at}`}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"
                                        >
                                            <div className="min-w-0 flex items-center gap-3">
                                                <div className="rounded-full bg-muted p-2">
                                                    {isCredit ? (
                                                        <ArrowDownLeft className="h-4 w-4 text-green-600" />
                                                    ) : (
                                                        <ArrowUpRight className="h-4 w-4 text-red-600" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">
                                                        {entry.txn_type}
                                                    </p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {entry.line_description ?? `Ref ${entry.journal_id.slice(0, 12)}…`}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isCredit ? '+' : '-'}
                                                    {formatCurrency(entry.amount, entry.currency || 'BBD')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(entry.posted_at)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Clock />}
                                title="No transactions yet"
                                description="Your recent transactions will appear here."
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
