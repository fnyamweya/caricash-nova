import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CreditCard, ArrowLeftRight, TrendingUp, QrCode, Users } from 'lucide-react';
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
            </div>
        </PageTransition>
    );
}
