import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    ArrowDownLeft,
    ArrowUpRight,
    UserPlus,
    Activity,
    Wallet,
    Clock,
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
    Badge,
    EmptyState,
    LoadingSpinner,
    formatCurrency,
    formatDate,
} from '@caricash/ui';

interface FloatBalanceResponse {
    agent_id: string;
    agent_code: string;
    currency: string;
    account_id: string;
    actual_balance: string;
    available_balance: string;
    hold_amount: string;
    pending_credits: string;
    correlation_id: string;
}

interface AgentTxSummaryResponse {
    agent_id: string;
    currency: string;
    today_date: string;
    today_deposits: string;
    total_transacted: string;
    today_cash: string;
    correlation_id: string;
}

interface FloatHistoryOperation {
    id: string;
    operation_type: string;
    amount: string;
    currency: string;
    journal_id?: string;
    balance_before: string;
    balance_after: string;
    requires_approval?: boolean | number;
    reason?: string;
    reference?: string;
    created_at: string;
}

interface FloatHistoryResponse {
    operations: FloatHistoryOperation[];
    count: number;
}

function inferFloatDirection(op: FloatHistoryOperation): 'CR' | 'DR' {
    const before = Number(op.balance_before ?? 0);
    const after = Number(op.balance_after ?? 0);

    if (Number.isFinite(before) && Number.isFinite(after) && after !== before) {
        return after > before ? 'CR' : 'DR';
    }

    return op.operation_type === 'TOP_UP' ? 'CR' : 'DR';
}

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const persistedCode =
        typeof window !== 'undefined' ? localStorage.getItem('caricash_agent_code') : null;
    const agentCode = (actor?.name || persistedCode || '').trim();

    const floatBalanceQuery = useQuery({
        queryKey: ['agent-float-balance', actor?.id, agentCode],
        queryFn: () =>
            api.get<FloatBalanceResponse>(
                `/float/${encodeURIComponent(agentCode)}/balance?currency=BBD`,
            ),
        enabled: !!agentCode,
        refetchInterval: 30_000,
    });

    const txSummaryQuery = useQuery({
        queryKey: ['agent-tx-summary', actor?.id],
        queryFn: () =>
            api.get<AgentTxSummaryResponse>(
                `/tx/agent/${encodeURIComponent(actor!.id)}/summary?currency=BBD`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    const floatHistoryQuery = useQuery<FloatHistoryResponse>({
        queryKey: ['agent-float-history-dashboard', actor?.id, agentCode],
        queryFn: () =>
            api.get<FloatHistoryResponse>(
                `/float/${encodeURIComponent(agentCode)}/history?limit=5`,
            ),
        enabled: !!agentCode,
        refetchInterval: 60_000,
    });

    const summaryError =
        (floatBalanceQuery.error as Error | null)?.message ??
        (txSummaryQuery.error as Error | null)?.message;
    const recentOperations = floatHistoryQuery.data?.operations ?? [];

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Agent Dashboard"
                    description="Manage cash-in, cash-out, and customer registration"
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <BalanceCard
                        balance={floatBalanceQuery.data?.actual_balance ?? '0.00'}
                        currency="BBD"
                        label="Agent Float Balance"
                        loading={floatBalanceQuery.isLoading}
                    />
                    <StatCard
                        title="Today's Deposits"
                        value={formatCurrency(txSummaryQuery.data?.today_deposits ?? '0.00', 'BBD')}
                        description="Cash-in value posted today"
                        icon={<ArrowDownToLine className="h-4 w-4" />}
                        loading={txSummaryQuery.isLoading}
                    />
                    <StatCard
                        title="Total Transacted"
                        value={formatCurrency(txSummaryQuery.data?.total_transacted ?? '0.00', 'BBD')}
                        description="All-time deposit and withdrawal volume"
                        icon={<Activity className="h-4 w-4" />}
                        loading={txSummaryQuery.isLoading}
                    />
                    <StatCard
                        title="Cash Available"
                        value={formatCurrency(floatBalanceQuery.data?.available_balance ?? '0.00', 'BBD')}
                        description={`Cash-out today ${formatCurrency(txSummaryQuery.data?.today_cash ?? '0.00', 'BBD')}`}
                        icon={<Wallet className="h-4 w-4" />}
                        loading={floatBalanceQuery.isLoading || txSummaryQuery.isLoading}
                    />
                </div>

                {(floatBalanceQuery.isError || txSummaryQuery.isError) && (
                    <p className="text-sm text-destructive">
                        {summaryError ?? 'Failed to load dashboard metrics.'}
                    </p>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ActionCard
                        title="Cash-In (Deposit)"
                        description="Deposit cash into a customer's CariCash wallet"
                        icon={<ArrowDownToLine className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/deposit' })}
                    />

                    <ActionCard
                        title="Cash-Out (Withdrawal)"
                        description="Withdraw cash from a customer's CariCash wallet"
                        icon={<ArrowUpFromLine className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/withdrawal' })}
                    />

                    <ActionCard
                        title="Register Customer"
                        description="Register a new customer for CariCash mobile money"
                        icon={<UserPlus className="h-5 w-5" />}
                        onClick={() => navigate({ to: '/register' })}
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
                        {!agentCode ? (
                            <EmptyState
                                icon={<Clock />}
                                title="Agent code required"
                                description="Recent transactions will appear after an agent profile is loaded."
                            />
                        ) : floatHistoryQuery.isLoading ? (
                            <div className="flex justify-center py-8">
                                <LoadingSpinner />
                            </div>
                        ) : recentOperations.length > 0 ? (
                            <div className="space-y-2">
                                {recentOperations.map((op) => {
                                    const direction = inferFloatDirection(op);
                                    const isCredit = direction === 'CR';
                                    const detail = op.reference
                                        || op.reason
                                        || (op.journal_id ? `Journal ${op.journal_id.slice(0, 12)}…` : 'Float operation');
                                    const requiresApproval = Boolean(op.requires_approval);

                                    return (
                                        <div
                                            key={op.id}
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
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-sm font-medium">
                                                            {op.operation_type}
                                                        </p>
                                                        {requiresApproval && (
                                                            <Badge variant="outline">Approval</Badge>
                                                        )}
                                                    </div>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {detail}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={`text-sm font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                                    {isCredit ? '+' : '-'}
                                                    {formatCurrency(op.amount, op.currency || 'BBD')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatDate(op.created_at)}
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
                                description="Recent agent float operations will appear here."
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
