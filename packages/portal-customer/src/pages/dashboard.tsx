import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SendHorizontal, ShoppingBag, Wallet, Clock } from 'lucide-react';
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
    EmptyState,
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
                `/wallets/CUSTOMER/${actor!.id}/BBD/balance`,
            ),
        enabled: !!actor?.id,
        refetchInterval: 30_000,
    });

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
                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/send' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <SendHorizontal className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Send Money</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Transfer funds to another CariCash customer
                            </p>
                        </CardContent>
                    </Card>

                    <Card
                        className="cursor-pointer transition-colors hover:border-primary"
                        onClick={() => navigate({ to: '/pay' })}
                    >
                        <CardHeader className="flex flex-row items-center gap-3 pb-2">
                            <ShoppingBag className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base">Pay Merchant</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">
                                Pay at a registered CariCash merchant
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Recent transactions placeholder */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Recent Transactions</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EmptyState
                            icon={<Clock />}
                            title="No transactions yet"
                            description="Your recent transactions will appear here."
                            action={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigate({ to: '/history' })}
                                >
                                    View History
                                </Button>
                            }
                        />
                    </CardContent>
                </Card>
            </div>
        </PageTransition>
    );
}
