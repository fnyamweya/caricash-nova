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
    Card,
    CardContent,
    CardHeader,
    CardTitle,
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
                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/deposit' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <ArrowDownToLine className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Cash-In (Deposit)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Deposit cash into a customer's CariCash wallet
                            </p>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/withdrawal' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <ArrowUpFromLine className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Cash-Out (Withdrawal)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Withdraw cash from a customer's CariCash wallet
                            </p>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/register' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <UserPlus className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Register Customer</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Register a new customer for CariCash mobile money
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
