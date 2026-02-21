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
} from '@caricash/ui';

interface BalanceResponse {
    balance: string;
    currency: string;
    wallet_id: string;
}

export function DashboardPage() {
    const { actor } = useAuth();
    const api = useApi();
    const navigate = useNavigate();

    const balanceQuery = useQuery({
        queryKey: ['balance', actor?.id],
        queryFn: () =>
            api.get<BalanceResponse>(
                `/wallets/AGENT/${actor!.id}/BBD/balance`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Agent Dashboard"
                    description="Manage cash-in, cash-out, and customer registration"
                />

                {/* Balance & Stats */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <BalanceCard
                        balance={balanceQuery.data?.balance ?? '0.00'}
                        currency="BBD"
                        label="Agent Float Balance"
                        loading={balanceQuery.isLoading}
                    />
                    <StatCard
                        title="Today's Deposits"
                        value="—"
                        description="Placeholder"
                        icon={<ArrowDownToLine className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Total Transacted"
                        value="—"
                        description="Placeholder"
                        icon={<Activity className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Currency"
                        value="BBD"
                        description="Barbadian Dollar"
                        icon={<Wallet className="h-4 w-4" />}
                    />
                </div>

                {/* Quick Actions */}
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
