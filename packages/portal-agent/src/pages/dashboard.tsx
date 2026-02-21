import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
    ArrowDownToLine,
    ArrowUpFromLine,
    UserPlus,
    Activity,
    Wallet,
} from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    BalanceCard,
    StatCard,
    ActionCard,
    formatCurrency,
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

    const summaryError =
        (floatBalanceQuery.error as Error | null)?.message ??
        (txSummaryQuery.error as Error | null)?.message;

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
            </div>
        </PageTransition>
    );
}
