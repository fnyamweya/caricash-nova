import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import {
    useApi,
    useAuth,
    PageHeader,
    PageTransition,
    TransactionTable,
    EmptyState,
    Badge,
    Button,
    SectionBlock,
    SectionToolbar,
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

                <SectionToolbar
                    title="History Filters"
                    description="Review customer transaction activity and refresh the latest results."
                    actions={(
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void txQuery.refetch()}
                            disabled={txQuery.isFetching}
                        >
                            {txQuery.isFetching ? 'Refreshing…' : 'Refresh'}
                        </Button>
                    )}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Customer</Badge>
                        <Badge variant="outline">
                            {transactions.length} item{transactions.length === 1 ? '' : 's'}
                        </Badge>
                        {txQuery.isLoading ? (
                            <Badge variant="outline">Loading</Badge>
                        ) : null}
                    </div>
                </SectionToolbar>

                {transactions.length > 0 ? (
                    <SectionBlock
                        title="Activity Feed"
                        description="Most recent customer transactions in chronological order."
                        contentClassName="p-0"
                    >
                        <TransactionTable
                            transactions={transactions}
                            loading={txQuery.isLoading}
                        />
                    </SectionBlock>
                ) : (
                    <SectionBlock
                        title="Activity Feed"
                        description="Customer transaction activity will appear here once transactions are available."
                    >
                        <EmptyState
                            icon={<Clock />}
                            title="No transactions yet"
                            description="Transaction history is not available at this time. Check back later."
                        />
                    </SectionBlock>
                )}
            </div>
        </PageTransition>
    );
}
