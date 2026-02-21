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
