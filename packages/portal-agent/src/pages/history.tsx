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
    ApiError,
} from '@caricash/ui';

export function HistoryPage() {
    const api = useApi();
    const { actor } = useAuth();

    const txQuery = useQuery<{ items: Transaction[] }>({
        queryKey: ['transactions', actor?.id],
        queryFn: async () => {
            try {
                return await api.get<{ items: Transaction[] }>(
                    `/tx?ownerType=AGENT&ownerId=${encodeURIComponent(actor!.id)}&currency=BBD&pageSize=200`,
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
                    description="View past agent transactions"
                />

                <SectionToolbar
                    title="History Controls"
                    description="Review agent transaction records and refresh the latest queue."
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
                        <Badge variant="outline">Agent</Badge>
                        <Badge variant="outline">
                            {transactions.length} item{transactions.length === 1 ? '' : 's'}
                        </Badge>
                        {txQuery.isLoading ? <Badge variant="outline">Loading</Badge> : null}
                    </div>
                </SectionToolbar>

                {transactions.length > 0 ? (
                    <SectionBlock
                        title="Activity Feed"
                        description="Recent agent transactions shown in descending order."
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
                        description="Agent transaction activity will appear here when the transaction listing endpoint is available."
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
