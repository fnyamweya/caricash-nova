import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import {
    useApi,
    useAuth,
    PageHeader,
    PageTransition,
    TransactionTable,
    EmptyState,
    Card,
    CardContent,
    type Transaction,
} from '@caricash/ui';
import { ApiError } from '@caricash/ui';

export function HistoryPage() {
    const api = useApi();
    const { actor } = useAuth();

    const txQuery = useQuery<{ items: Transaction[] }>({
        queryKey: ['transactions', actor?.id],
        queryFn: async () => {
            try {
                return await api.get<{ items: Transaction[] }>(
                    `/tx?ownerType=CUSTOMER&ownerId=${encodeURIComponent(actor!.id)}&currency=BBD&pageSize=200`,
                );
            } catch (err) {
                // Gracefully handle 501 Not Implemented
                if (err instanceof ApiError && err.status === 501) {
                    return { items: [] };
                }
                throw err;
            }
        },
        enabled: !!actor?.id,
    });

    const transactions = txQuery.data?.items ?? [];

    return (
        <PageTransition>
            <div className="flex flex-col gap-6">
                <PageHeader
                    title="Transaction History"
                    description="View your past transactions"
                />

                {transactions.length > 0 ? (
                    <TransactionTable
                        transactions={transactions}
                        loading={txQuery.isLoading}
                    />
                ) : (
                    <Card>
                        <CardContent className="py-8">
                            <EmptyState
                                icon={<Clock />}
                                title="No transactions yet"
                                description="Transaction history is not available at this time. Check back later."
                            />
                        </CardContent>
                    </Card>
                )}
            </div>
        </PageTransition>
    );
}
