import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    CreditCard,
    ArrowLeftRight,
    TrendingUp,
    QrCode,
    Users,
    Clock,
    ArrowDownLeft,
    ArrowUpRight,
} from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    BalanceCard,
    StatCard,
    ActionCard,
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    EmptyState,
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
    entry_type: 'DR' | 'CR';
    amount: string;
    posted_at: string;
    credit_amount_minor?: number;
    debit_amount_minor?: number;
    txn_type: string;
    line_description?: string;
    currency?: string;
}

interface StatementResponse {
    entries: StatementEntry[];
    count: number;
}

function isToday(dateStr: string): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
}

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const balanceQuery = useQuery({
        queryKey: ['balance', actor?.id],
        queryFn: () =>
            api.get<BalanceResponse>(
                `/wallets/MERCHANT/${actor!.id}/BBD/balance`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const statementQuery = useQuery({
        queryKey: ['merchant-statement-dash', actor?.id],
        queryFn: () =>
            api.get<StatementResponse>(
                `/wallets/MERCHANT/${actor!.id}/BBD/statement?limit=200`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 60_000,
    });

    // Compute stats from statement
    const entries = statementQuery.data?.entries ?? [];
    const credits = entries.filter((e) => e.entry_type === 'CR');
    const todayCredits = credits.filter((e) => isToday(e.posted_at));
    const recentEntries = entries.slice(0, 5);

    const todayTotal = todayCredits.reduce((sum, e) => {
        const amt = parseFloat(e.amount) || (e.credit_amount_minor ? e.credit_amount_minor / 100 : 0);
        return sum + amt;
    }, 0);

    const totalRevenue = credits.reduce((sum, e) => {
        const amt = parseFloat(e.amount) || (e.credit_amount_minor ? e.credit_amount_minor / 100 : 0);
        return sum + amt;
    }, 0);

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Dashboard"
                    description="Welcome to CariCash Merchant"
                />

                {/* Balance */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <BalanceCard
                        balance={balanceQuery.data?.balance ?? '0.00'}
                        currency="BBD"
                        label="Merchant Balance"
                        loading={balanceQuery.isLoading}
                    />
                    <StatCard
                        title="Today's Payments"
                        value={todayCredits.length > 0
                            ? `${todayCredits.length} (${formatCurrency(todayTotal.toFixed(2), 'BBD')})`
                            : '0'}
                        description="Incoming payments today"
                        icon={<CreditCard className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Revenue"
                        value={credits.length > 0
                            ? formatCurrency(totalRevenue.toFixed(2), 'BBD')
                            : '—'}
                        description={`Total from ${credits.length} transaction${credits.length !== 1 ? 's' : ''}`}
                        icon={<TrendingUp className="h-4 w-4" />}
                    />
                </div>

                {/* Quick actions */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ActionCard
                        title="My QR Code"
                        description="Display, download, or print your payment QR code"
                        icon={<QrCode className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/qr-code' })}
                    />

                    <ActionCard
                        title="Transfer to Merchant"
                        description="Send funds to another CariCash merchant"
                        icon={<ArrowLeftRight className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/transfer' })}
                    />

                    <ActionCard
                        title="View Payments"
                        description="Track incoming customer payments"
                        icon={<CreditCard className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/payments' })}
                    />

                    <ActionCard
                        title="Manage Team"
                        description="Add or manage users for your store"
                        icon={<Users className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/team' })}
                    />
                </div>

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
                        {statementQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner />
                            </div>
                        ) : recentEntries.length > 0 ? (
                            <div className="space-y-2">
                                {recentEntries.map((entry) => {
                                    const isCredit = entry.entry_type === 'CR';
                                    const amount = entry.amount
                                        || (
                                            ((isCredit ? entry.credit_amount_minor : entry.debit_amount_minor) ?? 0) / 100
                                        ).toFixed(2);

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
                                                    {formatCurrency(amount, entry.currency || 'BBD')}
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
                                description="Recent merchant transactions will appear here."
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
