import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, ArrowLeftRight, TrendingUp } from 'lucide-react';
import {
    useAuth,
    useApi,
    PageHeader,
    PageTransition,
    BalanceCard,
    StatCard,
    Button,
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
                `/wallets/MERCHANT/${actor!.id}/BBD/balance`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

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
                        value="—"
                        description="Incoming payments today"
                        icon={<CreditCard className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Revenue"
                        value="—"
                        description="Total revenue this period"
                        icon={<TrendingUp className="h-4 w-4" />}
                    />
                </div>

                {/* Quick actions */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/transfer' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <ArrowLeftRight className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Transfer to Merchant</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Send funds to another CariCash merchant
                            </p>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/payments' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <CreditCard className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">View Payments</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Track incoming customer payments
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </PageTransition>
    );
}
